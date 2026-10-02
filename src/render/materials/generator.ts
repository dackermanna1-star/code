/**
 * Procedural PBR block-material generator.
 *
 * Every block texture layer (see textureList.ts) is rendered on the GPU by one of 16 parameterised
 * GLSL "family" programs (./glsl/*.glsl, assembled in ./programs.ts; per-texture parameters in
 * ./defs.ts):
 *
 *   pass 1  family program  -> temp MRT (half float): linear albedo + alpha | height + roughness
 *           (optionally supersampled inside the shader)
 *   (cutout cards only) temp -> 1x1 alpha-weighted average colour of the card
 *   pass 2a temp            -> albedo array layer: micro-cavity shading from the height field,
 *                              colour dilation into transparent texels of cutout cards (nearby
 *                              opaque colours, else the card average) so mipmaps don't bleed
 *                              dark halos, sRGB encode
 *   pass 2b temp            -> normal array layer: Sobel normal of the wrapped height field,
 *                              height in .z, roughness in .w
 *
 * Mipmaps of both arrays are generated once, after the last layer. All noise is periodic, so
 * every texture tiles seamlessly. Renderer state (render target, clear colour, autoClear) is
 * restored when done.
 */
import * as THREE from 'three';
import { TEXTURE_NAMES } from './textureList';
import {
  ALBEDO_FRAG, AVERAGE_FRAG, NORMAL_FRAG, PROGRAM_NAMES, VERTEX, buildFallbackFragment, buildProgram,
  type BuiltProgram, type ProgramName,
} from './programs';
import { resolveDef, type ResolvedDef } from './defs';

export interface BlockMaterialSet {
  /** sampler2DArray, RGBA8: .rgb sRGB-encoded albedo, .a opacity (cutout/translucent) or tint mask (opaque). */
  albedo: THREE.Texture;
  /** sampler2DArray, RGBA8 linear: .xy tangent normal (n*0.5+0.5, x along +u, y along +v), .z height (1 = top), .w perceptual roughness. */
  normal: THREE.Texture;
  /** width = layerCount, height 1, RGBA8: .r metalness, .g emissive strength, .b emissive luminance threshold, .a subsurface. */
  props: THREE.DataTexture;
  /** Texture resolution (square). */
  size: number;
  layerCount: number;
}

export interface GenerateOptions {
  /** Supersampling factor per axis for the material pass (default: 2 for size <= 128, else 1). */
  supersample?: number;
  /** Yield to the event loop (and report progress) every N layers (default 6). */
  yieldEvery?: number;
  /** Generate mipmaps (default true). */
  mipmaps?: boolean;
  /** Anisotropy (default: renderer max). */
  anisotropy?: number;
  /** Debug: synchronise with the GPU after each stage and log timings. */
  timing?: boolean;
}

/** Physical depth (block units) represented by the full 0..1 height range at depth multiplier 1. */
export const HEIGHT_DEPTH = 0.06;

/** Wall-clock duration of the most recent generation (ms, CPU side; GPU work may still be queued). */
export let lastGenerationMs = 0;

/**
 * Generates every block texture layer (layer index = textureLayer(name)). `size` is the square
 * resolution (32..512 recommended; powers of two give the best mipmaps).
 */
export async function generateBlockMaterials(
  renderer: THREE.WebGLRenderer,
  size: number,
  onProgress?: (fraction: number) => void,
): Promise<BlockMaterialSet> {
  return generateLayers(renderer, size, TEXTURE_NAMES, onProgress);
}

/**
 * Debug/tooling helper: generates only the given texture names; array layer i holds names[i]
 * (the props texture is indexed the same way).
 */
export async function generateMaterialSubset(
  renderer: THREE.WebGLRenderer,
  size: number,
  names: readonly string[],
  onProgress?: (fraction: number) => void,
  options?: GenerateOptions,
): Promise<BlockMaterialSet & { names: readonly string[] }> {
  const set = await generateLayers(renderer, size, names, onProgress, options);
  return { ...set, names };
}

/** Releases the compiled material programs cached for `renderer` (they are kept for fast regeneration). */
export function disposeBlockMaterialPrograms(renderer: THREE.WebGLRenderer) {
  const cache = programCache.get(renderer);
  if (!cache) return;
  for (const e of cache.values()) e.material.dispose();
  programCache.delete(renderer);
}

interface ProgramEntry { built: BuiltProgram | null; material: THREE.RawShaderMaterial; ok: boolean }
type CacheKey = ProgramName | 'fallback';
const programCache = new WeakMap<THREE.WebGLRenderer, Map<CacheKey, ProgramEntry>>();

function makeMaterial(fragment: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERTEX,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    side: THREE.DoubleSide,
  });
}

function materialUniforms(): Record<string, THREE.IUniform> {
  return {
    uSize: { value: 64 },
    uSeed: { value: 1 },
    uSS: { value: 1 },
    uVariant: { value: 0 },
    uCutout: { value: 0 },
    uP: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uC: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0.5, 0.5, 0.5)) },
  };
}

function hasProgramError(renderer: THREE.WebGLRenderer, material: THREE.Material): boolean {
  const props = renderer.properties.get(material) as { currentProgram?: { diagnostics?: { runnable: boolean } } };
  const prog = props.currentProgram;
  if (!prog) return true;
  return prog.diagnostics !== undefined && prog.diagnostics.runnable === false;
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

async function generateLayers(
  renderer: THREE.WebGLRenderer,
  sizeIn: number,
  names: readonly string[],
  onProgress?: (fraction: number) => void,
  options: GenerateOptions = {},
): Promise<BlockMaterialSet> {
  const size = Math.max(8, Math.min(2048, Math.round(sizeIn)));
  const layerCount = names.length;
  const ss = Math.max(1, Math.min(4, Math.round(options.supersample ?? (size <= 128 ? 2 : 1))));
  const yieldEvery = Math.max(1, options.yieldEvery ?? 6);
  const anisotropy = options.anisotropy ?? renderer.capabilities.getMaxAnisotropy();
  const mipmaps = options.mipmaps ?? true;
  const timing = options.timing ?? false;
  const t0 = performance.now();

  // ---- save renderer state
  const prevTarget = renderer.getRenderTarget();
  const prevFace = renderer.getActiveCubeFace();
  const prevMip = renderer.getActiveMipmapLevel();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevClearAlpha = renderer.getClearAlpha();
  const prevAutoClear = renderer.autoClear;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(geometry);
  mesh.frustumCulled = false;

  const temp = new THREE.WebGLRenderTarget(size, size, {
    count: 2,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  const arrayOpts = {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    generateMipmaps: false,
    depthBuffer: false,
    anisotropy,
  } as const;
  const albedoRT = new THREE.WebGLArrayRenderTarget(size, size, layerCount, arrayOpts);
  const normalRT = new THREE.WebGLArrayRenderTarget(size, size, layerCount, arrayOpts);
  albedoRT.texture.name = 'blockAlbedo';
  normalRT.texture.name = 'blockNormal';
  albedoRT.texture.colorSpace = THREE.NoColorSpace; // sRGB-encoded data, decoded by the terrain shader
  normalRT.texture.colorSpace = THREE.NoColorSpace;
  // Let consumers reach the owning render targets (e.g. to dispose them).
  albedoRT.texture.renderTarget = albedoRT;
  normalRT.texture.renderTarget = normalRT;

  const gl = renderer.getContext();
  const syncPx = new Uint8Array(4);
  const sync = (label: string, t: number) => {
    if (!timing) return;
    renderer.setRenderTarget(normalRT, 0);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx);
    console.log(`[materials] ${label}: ${(performance.now() - t).toFixed(1)} ms`);
  };

  const avgRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
  const avgMat = makeMaterial(AVERAGE_FRAG, { tA: { value: temp.textures[0] }, uN: { value: size } });
  const albedoMat = makeMaterial(ALBEDO_FRAG, {
    tAvg: { value: avgRT.texture },
    tA: { value: temp.textures[0] },
    tS: { value: temp.textures[1] },
    uN: { value: size },
    uCutout: { value: 0 },
    uBg: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
    uCavity: { value: 0 },
  });
  const normalMat = makeMaterial(NORMAL_FRAG, {
    tS: { value: temp.textures[1] },
    tA: { value: temp.textures[0] },
    uN: { value: size },
    uCutout: { value: 0 },
    uDepth: { value: HEIGHT_DEPTH },
  });
  const propsData = new Uint8Array(layerCount * 4);

  try {
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.initRenderTarget(albedoRT);
    renderer.initRenderTarget(normalRT);
    renderer.initRenderTarget(temp);
    renderer.initRenderTarget(avgRT);

    // ---- resolve definitions & compile the programs they need (in parallel when supported)
    const defs: ResolvedDef[] = names.map((n) => resolveDef(n));
    let cache = programCache.get(renderer);
    if (!cache) {
      cache = new Map();
      programCache.set(renderer, cache);
    }
    const needed = new Set<ProgramName>(defs.map((d) => d.prog));
    const compileScene = new THREE.Scene();
    const fresh: CacheKey[] = [];
    const addProgram = (key: CacheKey, built: BuiltProgram | null, fragment: string) => {
      const material = makeMaterial(fragment, materialUniforms());
      cache!.set(key, { built, material, ok: true });
      const m = new THREE.Mesh(geometry, material);
      m.frustumCulled = false;
      compileScene.add(m);
      fresh.push(key);
    };
    for (const p of PROGRAM_NAMES) {
      if (!needed.has(p) || cache.has(p)) continue;
      const built = buildProgram(p);
      addProgram(p, built, built.fragment);
    }
    if (!cache.has('fallback')) addProgram('fallback', null, buildFallbackFragment());
    for (const m of [albedoMat, normalMat, avgMat]) {
      const mm = new THREE.Mesh(geometry, m);
      mm.frustumCulled = false;
      compileScene.add(mm);
    }
    // Progress: the first 10% covers shader compilation, the rest the layers.
    const compileShare = fresh.length > 0 ? 0.1 : 0;
    onProgress?.(0);
    renderer.setRenderTarget(temp);
    let tc = performance.now();
    await renderer.compileAsync(compileScene, camera);
    sync('compileAsync', tc);
    for (let k = 0; k < fresh.length; k++) {
      // Force a first draw so the link status is checked (and, without parallel compile support,
      // so the compile happens here, one program at a time between yields), and record failures.
      const p = fresh[k];
      const entry = cache.get(p)!;
      tc = performance.now();
      mesh.material = entry.material;
      entry.material.uniforms.uSize.value = 4;
      renderer.setRenderTarget(temp);
      renderer.render(mesh, camera);
      entry.ok = !hasProgramError(renderer, entry.material);
      if (!entry.ok) console.error(`[materials] program '${p}' failed to compile; its layers use the fallback`);
      sync(`first draw '${p}'`, tc);
      onProgress?.((compileShare * (k + 1)) / fresh.length);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    const fallback = cache.get('fallback')!;

    // ---- render layers
    for (let i = 0; i < layerCount; i++) {
      const def = defs[i];
      const tl = performance.now();
      let entry = cache.get(def.prog)!;
      let variant = entry.built?.variants.get(def.v);
      if (variant === undefined) {
        if (def.v !== 'missing') console.warn(`[materials] '${names[i]}': unknown variant '${def.v}' in '${def.prog}'`);
        variant = -1; // every family program renders the 'missing' checker for unknown variants
      }
      if (!entry.ok) {
        entry = fallback;
        variant = 0;
      }
      const u = entry.material.uniforms;
      u.uSize.value = size;
      u.uSeed.value = def.seed;
      u.uSS.value = ss;
      u.uVariant.value = variant;
      u.uCutout.value = def.cutout ? 1 : 0;
      for (let k = 0; k < 4; k++) {
        (u.uP.value[k] as THREE.Vector4).set(def.p[k * 4] ?? 0, def.p[k * 4 + 1] ?? 0, def.p[k * 4 + 2] ?? 0, def.p[k * 4 + 3] ?? 0);
      }
      for (let k = 0; k < 8; k++) {
        const c = def.c[k] ?? [0.5, 0.5, 0.5];
        (u.uC.value[k] as THREE.Vector3).set(c[0], c[1], c[2]);
      }
      // pass 1: material
      mesh.material = entry.material;
      renderer.setRenderTarget(temp);
      renderer.render(mesh, camera);

      // cutout cards: average colour (fill for fully transparent texels, see ALBEDO_FRAG)
      if (def.cutout) {
        mesh.material = avgMat;
        renderer.setRenderTarget(avgRT);
        renderer.render(mesh, camera);
      }
      // pass 2a: albedo (the mip chain is built once, by the draw into the final layer)
      const last = i === layerCount - 1;
      albedoMat.uniforms.uCutout.value = def.cutout ? 1 : 0;
      albedoMat.uniforms.uCavity.value = def.cavity;
      const bg = def.c[0] ?? [0.2, 0.2, 0.2];
      (albedoMat.uniforms.uBg.value as THREE.Vector3).set(bg[0], bg[1], bg[2]);
      if (last && mipmaps) albedoRT.texture.generateMipmaps = true;
      mesh.material = albedoMat;
      renderer.setRenderTarget(albedoRT, i);
      renderer.render(mesh, camera);

      // pass 2b: normal + height + roughness
      normalMat.uniforms.uCutout.value = def.cutout ? 1 : 0;
      normalMat.uniforms.uDepth.value = HEIGHT_DEPTH * def.depth;
      if (last && mipmaps) normalRT.texture.generateMipmaps = true;
      mesh.material = normalMat;
      renderer.setRenderTarget(normalRT, i);
      renderer.render(mesh, camera);

      sync(`layer ${i} '${names[i]}'`, tl);
      propsData[i * 4 + 0] = Math.round(255 * clamp01(def.metal));
      propsData[i * 4 + 1] = Math.round(255 * clamp01(def.emit));
      propsData[i * 4 + 2] = Math.round(255 * clamp01(def.thr));
      propsData[i * 4 + 3] = Math.round(255 * clamp01(def.sss));

      if ((i + 1) % yieldEvery === 0 || last) {
        onProgress?.(compileShare + ((1 - compileShare) * (i + 1)) / layerCount);
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
    // Keep later renders into the arrays from regenerating (and overwriting) the mip chain.
    albedoRT.texture.generateMipmaps = false;
    normalRT.texture.generateMipmaps = false;
  } catch (err) {
    albedoRT.dispose();
    normalRT.dispose();
    throw err;
  } finally {
    renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    renderer.setClearColor(prevClear, prevClearAlpha);
    renderer.autoClear = prevAutoClear;
    temp.dispose();
    albedoMat.dispose();
    avgMat.dispose();
    avgRT.dispose();
    normalMat.dispose();
    geometry.dispose();
  }

  const props = new THREE.DataTexture(propsData, layerCount, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  props.minFilter = THREE.NearestFilter;
  props.magFilter = THREE.NearestFilter;
  props.generateMipmaps = false;
  props.needsUpdate = true;
  props.name = 'blockProps';

  lastGenerationMs = performance.now() - t0;
  return { albedo: albedoRT.texture, normal: normalRT.texture, props, size, layerCount };
}
