/**
 * Procedural PBR block-material generator.
 *
 * Every block texture layer is rendered on the GPU by a parameterised GLSL material program
 * (see ./glsl/*.glsl and ./defs.ts):
 *
 *   pass 1  material program -> temp MRT (linear albedo + alpha, height + roughness), half-float
 *   pass 2a temp albedo  -> albedo array layer (alpha-aware colour dilation, sRGB encode)
 *   pass 2b temp height  -> normal array layer (Sobel normal from the wrapped height field)
 *
 * Mipmaps of both arrays are generated once at the end. All noise is periodic so every
 * texture tiles seamlessly.
 */
import * as THREE from 'three';
import { TEXTURE_NAMES } from './textureList';
import { ALBEDO_FRAG, NORMAL_FRAG, PROGRAM_NAMES, VERTEX, buildProgram, type BuiltProgram, type ProgramName } from './programs';
import { resolveDef, type ResolvedDef } from './defs';

export interface BlockMaterialSet {
  /** sampler2DArray, RGBA8: .rgb sRGB-encoded albedo, .a opacity (cutout/translucent) or tint mask (opaque). */
  albedo: THREE.Texture;
  /** sampler2DArray, RGBA8 linear: .xy tangent normal (n*0.5+0.5), .z height (1 = top), .w perceptual roughness. */
  normal: THREE.Texture;
  /** width = layerCount, height 1, RGBA8: .r metalness, .g emissive, .b emissive luminance threshold, .a subsurface. */
  props: THREE.DataTexture;
  /** Texture resolution (square). */
  size: number;
  layerCount: number;
}

export interface GenerateOptions {
  /** Supersampling factor per axis for the material pass (default: 2 for size <= 128, else 1). */
  supersample?: number;
  /** Layers to yield after (default 6). */
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

const programCache = new WeakMap<THREE.WebGLRenderer, Map<ProgramName, { built: BuiltProgram; material: THREE.RawShaderMaterial; ok: boolean }>>();

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
    uZero: { value: 0 },
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
  const anisotropy = options.anisotropy ?? renderer.capabilities.getMaxAnisotropy();
  const mipmaps = options.mipmaps ?? true;
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
  albedoRT.texture.colorSpace = THREE.NoColorSpace;
  normalRT.texture.colorSpace = THREE.NoColorSpace;
  // Let consumers reach the owning render targets (e.g. to dispose them).
  albedoRT.texture.renderTarget = albedoRT;
  normalRT.texture.renderTarget = normalRT;
  const timing = options.timing ?? false;
  const gl = renderer.getContext();
  const syncPx = new Uint8Array(4);
  const sync = (label: string, t: number) => {
    if (!timing) return;
    renderer.setRenderTarget(normalRT, 0);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx);
    console.log(`[materials] ${label}: ${(performance.now() - t).toFixed(1)} ms`);
  };

  const albedoMat = makeMaterial(ALBEDO_FRAG, {
    tA: { value: temp.textures[0] },
    uN: { value: size },
    uCutout: { value: 0 },
    uBg: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
  });
  const normalMat = makeMaterial(NORMAL_FRAG, {
    tS: { value: temp.textures[1] },
    tA: { value: temp.textures[0] },
    uN: { value: size },
    uCutout: { value: 0 },
    uDepth: { value: HEIGHT_DEPTH },
  });

  const propsData = new Uint8Array(layerCount * 4);
  const t0 = performance.now();

  try {
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.initRenderTarget(albedoRT);
    renderer.initRenderTarget(normalRT);
    renderer.initRenderTarget(temp);

    // ---- resolve definitions & compile the programs they need (in parallel when supported)
    const defs: ResolvedDef[] = names.map((n) => resolveDef(n));
    let cache = programCache.get(renderer);
    if (!cache) {
      cache = new Map();
      programCache.set(renderer, cache);
    }
    const needed = new Set<ProgramName>(defs.map((d) => d.prog));
    const compileScene = new THREE.Scene();
    const fresh: ProgramName[] = [];
    for (const p of PROGRAM_NAMES) {
      if (!needed.has(p) || cache.has(p)) continue;
      const built = buildProgram(p);
      const material = makeMaterial(built.fragment, materialUniforms());
      cache.set(p, { built, material, ok: true });
      const m = new THREE.Mesh(geometry, material);
      m.frustumCulled = false;
      compileScene.add(m);
      fresh.push(p);
    }
    for (const m of [albedoMat, normalMat]) {
      const mm = new THREE.Mesh(geometry, m);
      mm.frustumCulled = false;
      compileScene.add(mm);
    }
    renderer.setRenderTarget(temp);
    let tc = performance.now();
    await renderer.compileAsync(compileScene, camera);
    sync('compileAsync', tc);
    for (const p of fresh) {
      const entry = cache.get(p)!;
      // Force a draw so program link status is checked, then record failures.
      tc = performance.now();
      mesh.material = entry.material;
      entry.material.uniforms.uSize.value = 4;
      renderer.setRenderTarget(temp);
      renderer.render(mesh, camera);
      entry.ok = !hasProgramError(renderer, entry.material);
      if (!entry.ok) console.error(`[materials] program '${p}' failed to compile; its layers use the fallback`);
      sync(`first draw '${p}'`, tc);
    }

    // ---- render layers
    for (let i = 0; i < layerCount; i++) {
      const def = defs[i];
      const tl = performance.now();
      const entry = cache.get(def.prog)!;
      let variant = entry.built.variants.get(def.v);
      if (variant === undefined) {
        if (def.v !== 'missing') console.warn(`[materials] '${names[i]}': unknown variant '${def.v}' in '${def.prog}'`);
        variant = -1; // every program renders the 'missing' checker for unknown variants
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
      // pass 1
      mesh.material = entry.material;
      renderer.setRenderTarget(temp);
      renderer.render(mesh, camera);

      // pass 2a albedo
      albedoMat.uniforms.uCutout.value = def.cutout ? 1 : 0;
      const bg = def.c[0] ?? [0.2, 0.2, 0.2];
      (albedoMat.uniforms.uBg.value as THREE.Vector3).set(bg[0], bg[1], bg[2]);
      const last = i === layerCount - 1;
      if (last && mipmaps) albedoRT.texture.generateMipmaps = true; // mip chain built once, after the final layer
      mesh.material = albedoMat;
      renderer.setRenderTarget(albedoRT, i);
      renderer.render(mesh, camera);

      // pass 2b normal
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
        onProgress?.((i + 1) / layerCount);
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
    // Keep further renders into the arrays from regenerating the mip chain.
    albedoRT.texture.generateMipmaps = false;
    normalRT.texture.generateMipmaps = false;
  } finally {
    renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    renderer.setClearColor(prevClear, prevClearAlpha);
    renderer.autoClear = prevAutoClear;
    temp.dispose();
    albedoMat.dispose();
    normalMat.dispose();
    geometry.dispose();
  }

  const props = new THREE.DataTexture(propsData, layerCount, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  props.minFilter = THREE.NearestFilter;
  props.magFilter = THREE.NearestFilter;
  props.generateMipmaps = false;
  props.needsUpdate = true;
  props.name = 'blockProps';

  const ms = performance.now() - t0;
  (generateLayers as unknown as { lastMs: number }).lastMs = ms;
  lastGenerationMs = ms;
  return { albedo: albedoRT.texture, normal: normalRT.texture, props, size, layerCount };
}

/** Wall-clock duration of the most recent generation (ms). */
export let lastGenerationMs = 0;

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
