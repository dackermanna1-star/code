// World material plugin (texture-array surfaces driven by per-vertex attributes) + texture-array helpers.
// Verified by render-materials-plugin-*.probe.ts. This is the reference implementation copied into
// docs/api-notes/rendering-materials-geometry.md.
//
// Per-vertex inputs:
//   uv     (vec2, standard "uv" kind)  : texture coordinates in REPEATS (metres / surface worldSize); REPEAT wrap
//   color  (vec4, standard "color")    : rgb = tint (LINEAR for PBR, gamma for Standard), a = metallic (0..1)
//                                        (mesh.hasVertexAlpha must stay false so Babylon ignores color.a)
//   surf   (vec4, custom "surf" kind)  : x = albedo layer, y = normal layer (0 = flat), z = roughness (0..1),
//                                        w = emissive strength (HDR multiplier of the albedo, 0 = none)
// Textures:
//   albedoArray : RGBA8 RawTexture2DArray, rgb = albedo (sRGB), a = roughness multiplier (255 = 1.0)
//   normalArray : RGBA8 RawTexture2DArray, OpenGL-style tangent-space normals (+x = +u, +y = +v), layer 0 flat
import {
  MaterialPluginBase,
  PBRBaseMaterial,
  RawTexture2DArray,
  Texture,
  Constants,
  type Material,
  type MaterialDefines,
  type Scene,
  type AbstractMesh,
  type SubMesh,
  type UniformBuffer,
  type AbstractEngine,
  type BaseTexture,
  type Nullable,
} from "@babylonjs/core";

const VERTEX_DEFS = /* glsl */ `
#ifdef WORLDMAT_SURF
attribute vec4 surf;
#endif
varying vec4 vWmSurf;
varying vec2 vWmUV;
varying float vWmMetal;
`;

const VERTEX_MAIN_END = /* glsl */ `
#ifdef WORLDMAT_SURF
vWmSurf = surf;
#else
vWmSurf = vec4(0.0, 0.0, 1.0, 0.0); // mesh without "surf": layer 0, flat normal, rough 1, not emissive
#endif
vWmUV = uvUpdated;
#ifdef VERTEXCOLOR
vWmMetal = color.a;
#else
vWmMetal = 0.0;
#endif
`;

// Shared fragment declarations. Globals are written in main() (MAIN_BEGIN) and read inside Babylon's
// block functions (albedoOpacityBlock / reflectivityBlock), which are defined AFTER this point.
const FRAGMENT_DEFS = /* glsl */ `
uniform highp sampler2DArray wmAlbedoSampler;
#ifdef WORLDMAT_NORMALMAP
uniform highp sampler2DArray wmNormalSampler;
#endif
varying vec4 vWmSurf;
varying vec2 vWmUV;
varying float vWmMetal;
vec4 wmAlbedoTex;
vec3 wmBaseColor;
// Same maths as Babylon's cotangent_frame (bumpFragmentMainFunctions), renamed to avoid clashes.
mat3 wmCotangentFrame(vec3 normal, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, normal);
  vec3 dp1perp = cross(normal, dp1);
  vec3 tangent = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 bitangent = dp2perp * duv1.y + dp1perp * duv2.y;
  float det = max(dot(tangent, tangent), dot(bitangent, bitangent));
  float invmax = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(tangent * invmax, bitangent * invmax, normal);
}
`;

const FRAGMENT_MAIN_BEGIN = /* glsl */ `
wmAlbedoTex = texture(wmAlbedoSampler, vec3(vWmUV, vWmSurf.x));
`;

// Perturb normalW before any lighting uses it. No branches around texture()/dFdx (derivatives must be
// computed in uniform control flow); layer 0 of the normal array is flat.
const FRAGMENT_NORMAL = /* glsl */ `
#ifdef WORLDMAT_NORMALMAP
{
  vec3 wmN = texture(wmNormalSampler, vec3(vWmUV, vWmSurf.y)).xyz * 2.0 - 1.0;
  wmN.xy *= wmParams.x;
  normalW = normalize(wmCotangentFrame(normalW, vPositionW, vWmUV) * wmN);
}
#endif
`;

function pbrFragment(): Record<string, string> {
  return {
    CUSTOM_FRAGMENT_DEFINITIONS: FRAGMENT_DEFS,
    CUSTOM_FRAGMENT_MAIN_BEGIN: FRAGMENT_MAIN_BEGIN,
    // inside albedoOpacityBlock(): vertex colour already multiplied in; texture is sRGB -> linear
    CUSTOM_FRAGMENT_UPDATE_ALBEDO: `surfaceAlbedo *= toLinearSpace(wmAlbedoTex.rgb);\nwmBaseColor = surfaceAlbedo;`,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS: FRAGMENT_NORMAL,
    // inside reflectivityBlock() (needs METALLICWORKFLOW: set material.metallic/roughness non-null)
    CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `metallicRoughness.r = vWmMetal;\nmetallicRoughness.g = clamp(vWmSurf.z * wmAlbedoTex.a, 0.03, 1.0);`,
    // HDR emissive, added after lighting; fog is applied afterwards (emissive fades in fog)
    CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `finalEmissive += wmBaseColor * vWmSurf.w * wmParams.y;`,
  };
}

function standardFragment(): Record<string, string> {
  return {
    CUSTOM_FRAGMENT_DEFINITIONS: FRAGMENT_DEFS,
    CUSTOM_FRAGMENT_MAIN_BEGIN: FRAGMENT_MAIN_BEGIN,
    // baseColor already includes the vertex colour here
    CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `baseColor.rgb *= wmAlbedoTex.rgb;\nwmBaseColor = baseColor.rgb;`,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS: FRAGMENT_NORMAL,
    // Regex injection (key starts with "!"): rewrite glossiness/specular from per-vertex roughness.
    // $0 would re-insert the matched text; here the match is replaced entirely.
    "!float glossiness=vSpecularColor\\.a;": `float glossiness=max(2.0, exp2(10.0*(1.0-clamp(vWmSurf.z*wmAlbedoTex.a,0.0,1.0))));`,
    "!vec3 specularColor=vSpecularColor\\.rgb;": `vec3 specularColor=vSpecularColor.rgb*(1.0-clamp(vWmSurf.z*wmAlbedoTex.a,0.0,1.0));`,
    // StandardMaterial clamps diffuse+emissive to [0,1]; add HDR emissive after that, before fog
    CUSTOM_FRAGMENT_BEFORE_FOG: `color.rgb += wmBaseColor * vWmSurf.w * wmParams.y;`,
  };
}

export class WorldMaterialPlugin extends MaterialPluginBase {
  /** RGBA8 texture array: rgb = albedo (sRGB), a = roughness multiplier. Required (material not ready without it). */
  albedoArray: Nullable<BaseTexture> = null;
  /** RGBA8 texture array of tangent-space normals (OpenGL style, layer 0 = flat). Optional. */
  normalArray: Nullable<BaseTexture> = null;
  /** Multiplies the normal map xy (0 = flat). */
  normalStrength = 1;
  /** Global multiplier for per-vertex emissive (surf.w). */
  emissiveScale = 1;

  constructor(material: Material) {
    // name, priority, defines (+default values), addToPluginList, enable
    super(material, "WorldMaterial", 200, { WORLDMAT_NORMALMAP: false, WORLDMAT_SURF: false }, true, true);
  }

  /** Assign textures; marks defines dirty (needed when the normal map is added/removed). */
  setTextures(albedo: Nullable<BaseTexture>, normal: Nullable<BaseTexture>): void {
    this.albedoArray = albedo;
    this.normalArray = normal;
    this.markAllDefinesAsDirty();
  }

  override getClassName(): string {
    return "WorldMaterialPlugin";
  }

  override isReadyForSubMesh(_defines: MaterialDefines, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): boolean {
    if (!this.albedoArray || !this.albedoArray.isReady()) return false;
    return !this.normalArray || this.normalArray.isReady();
  }

  override prepareDefinesBeforeAttributes(defines: MaterialDefines, _scene: Scene, _mesh: AbstractMesh): void {
    // Babylon only declares the `uv` attribute (UV1 define) when a built-in texture needs it.
    defines._needUVs = true;
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh): void {
    defines["WORLDMAT_NORMALMAP"] = !!this.normalArray;
    // without the attribute, WebGL feeds the default (0,0,0,1) => surf.w = 1 => everything would glow
    defines["WORLDMAT_SURF"] = mesh.isVerticesDataPresent("surf");
  }

  override getAttributes(attributes: string[], _scene: Scene, _mesh: AbstractMesh): void {
    attributes.push("surf");
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("wmAlbedoSampler", "wmNormalSampler");
  }

  override getUniforms() {
    return {
      ubo: [{ name: "wmParams", size: 4, type: "vec4" }],
      fragment: "uniform vec4 wmParams;", // used only when uniform buffers are unsupported
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    if (!uniformBuffer.useUbo || !this._material.isFrozen || !uniformBuffer.isSync) {
      uniformBuffer.updateFloat4("wmParams", this.normalStrength, this.emissiveScale, 0, 0);
    }
    uniformBuffer.setTexture("wmAlbedoSampler", this.albedoArray);
    if (this.normalArray) uniformBuffer.setTexture("wmNormalSampler", this.normalArray);
  }

  override hasTexture(texture: BaseTexture): boolean {
    return texture === this.albedoArray || texture === this.normalArray;
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    if (this.albedoArray) activeTextures.push(this.albedoArray);
    if (this.normalArray) activeTextures.push(this.normalArray);
  }

  override dispose(forceDisposeTextures?: boolean): void {
    if (forceDisposeTextures) {
      this.albedoArray?.dispose();
      this.normalArray?.dispose();
    }
  }

  // Called from the base constructor (before subclass fields exist): depend only on this._material.
  override getCustomCode(shaderType: string): Nullable<Record<string, string>> {
    if (shaderType === "vertex") {
      return { CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFS, CUSTOM_VERTEX_MAIN_END: VERTEX_MAIN_END };
    }
    return this._material instanceof PBRBaseMaterial ? pbrFragment() : standardFragment();
  }
}

// ---------------------------------------------------------------------------------------------------
// Texture-array helpers

/** Flip rows in place so that image row 0 (top) ends up at v = 1 (OpenGL convention). */
export function flipRowsRGBA(data: Uint8Array | Uint8ClampedArray, width: number, height: number): void {
  const stride = width * 4;
  const tmp = new Uint8Array(stride);
  for (let y = 0; y < height >> 1; y++) {
    const a = y * stride;
    const b = (height - 1 - y) * stride;
    tmp.set(data.subarray(a, a + stride));
    data.copyWithin(a, b, b + stride);
    data.set(tmp, b);
  }
}

/** RGBA bytes of a canvas, rows flipped so the canvas top is at v = 1. */
export function canvasToLayer(canvas: HTMLCanvasElement | OffscreenCanvas, flipY = true): Uint8Array {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = new Uint8Array(img.data.buffer.slice(0));
  if (flipY) flipRowsRGBA(out, canvas.width, canvas.height);
  return out;
}

/** Decode a JPG/PNG (url or blob URL) into RGBA bytes (rows flipped so image top is v = 1). */
export async function decodeImageToLayer(url: string, size: number, flipY = true): Promise<Uint8Array> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, size, size); // resamples if the image is not size x size
  bmp.close();
  return canvasToLayer(c, flipY);
}

/** Build an RGBA8 2D array texture from equally sized layers (row 0 of each layer = v 0). */
export function createTextureArray(
  scene: Scene,
  layers: Uint8Array[],
  size: number,
  opts: { mipmaps?: boolean; samplingMode?: number; anisotropy?: number } = {},
): RawTexture2DArray {
  const layerBytes = size * size * 4;
  const data = new Uint8Array(layerBytes * layers.length);
  layers.forEach((l, i) => {
    if (l.length !== layerBytes) throw new Error(`layer ${i}: expected ${layerBytes} bytes, got ${l.length}`);
    data.set(l, i * layerBytes);
  });
  const mipmaps = opts.mipmaps ?? true;
  const tex = new RawTexture2DArray(
    data,
    size,
    size,
    layers.length,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    mipmaps,
    false, // invertY: MUST be false for ArrayBufferView uploads to 3D/array textures (flip rows on the CPU instead)
    opts.samplingMode ?? (mipmaps ? Texture.TRILINEAR_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE),
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  tex.wrapU = Texture.WRAP_ADDRESSMODE; // default already, explicit for clarity
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = opts.anisotropy ?? 4; // only applied with TRILINEAR / BILINEAR / LINEAR_LINEAR_MIPNEAREST
  return tex;
}
