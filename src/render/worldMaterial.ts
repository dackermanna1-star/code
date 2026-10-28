// The shared world material: ONE PBRMaterial (metallic workflow) extended by a material plugin
// that samples the albedo/roughness and normal/emissive texture ARRAYS using per-vertex
// attributes (layout documented at the top of src/render/batch.ts):
//
//   uv    → texture repeats             color → linear tint (PBR vertex colour, built in)
//   surf  → (albedo layer, normal layer, roughness|metallic bytes, signed emissive)
//
// Per-pixel: albedo = tex.rgb (sRGB→linear) × tint; roughness = surface roughness ×
// relative texture roughness (tex.a·2); metallic = surface metallic; normal = derivative-based
// cotangent-frame perturbation (no tangents needed, works with any planar UV, mirrored or not,
// and inside flipped render targets); emissive = albedo × tint × |surf.w| × mask(normal.a),
// mains-powered (surf.w > 0) emissive scaled by the power uniform (Render.setPower).
// Everything else (cascaded shadows, point/spot lights, fog, SSAO pre-pass, IBL reflections,
// image processing) is stock PBR, so the world receives all scene lighting.
// The same plugin in "glass" mode drives the transparent glass material (see glass.ts):
// vertex alpha (color.a) = opacity, plus a fresnel term that thickens and tints grazing views.
//
// Thin instances work too: give the instanced mesh `surf` (and optionally `color`) per
// instance via thinInstanceSetBuffer — the shader reads the attribute by name either way.

import { PBRMaterial, MaterialPluginBase, Color3, type Scene, type UniformBuffer, type AbstractEngine, type SubMesh, type MaterialDefines, type AbstractMesh, type BaseTexture } from "@babylonjs/core";
import type { TextureLibrary } from "./textures.ts";

const VERTEX_DEFS = /* glsl */ `
#ifdef WORLDMAT
attribute vec4 surf;
#ifndef UV1
attribute vec2 uv;
#endif
varying vec2 vWmUV;
flat varying vec4 vWmSurf;
flat varying float vWmEmit;
#endif
`;

const VERTEX_MAIN_END = /* glsl */ `
#ifdef WORLDMAT
vWmUV = uv;
{
  float wmRM = floor(surf.z + 0.5);
  float wmMet = floor(wmRM / 256.0);
  float wmRgh = wmRM - wmMet * 256.0;
  vWmSurf = vec4(floor(surf.x + 0.5), floor(surf.y + 0.5), wmRgh / 255.0, wmMet / 255.0);
  vWmEmit = surf.w;
}
#endif
`;

const FRAGMENT_DEFS = /* glsl */ `
#ifdef WORLDMAT
uniform highp sampler2DArray wmAlbedoArr;
uniform highp sampler2DArray wmNormalArr;
varying vec2 vWmUV;
flat varying vec4 vWmSurf;
flat varying float vWmEmit;
vec4 wmAlb;
vec4 wmNrm;
float wmRough;
float wmMetal;
vec3 wmEmissive;
// Perturb N by a tangent-space normal using the screen-space cotangent frame of (P, uv).
// sign(det) fixes handedness (left-handed world, mirrored UVs, flipped render targets).
vec3 wmPerturbNormal(vec3 N, vec3 P, vec2 tuv, vec3 tn) {
  vec3 dp1 = dFdx(P);
  vec3 dp2 = dFdy(P);
  vec2 duv1 = dFdx(tuv);
  vec2 duv2 = dFdy(tuv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float m = max(dot(T, T), dot(B, B));
  if (m < 1e-30) return N;
  float s = dot(N, cross(dp1, dp2)) < 0.0 ? -1.0 : 1.0;
  float k = inversesqrt(m) * s;
  vec3 n = T * (tn.x * k) + B * (tn.y * k) + N * max(tn.z, 0.05);
  float l2 = dot(n, n);
  return l2 > 1e-12 ? n * inversesqrt(l2) : N;
}
#endif
`;

const FRAGMENT_MAIN_BEGIN = /* glsl */ `
#ifdef WORLDMAT
wmAlb = texture(wmAlbedoArr, vec3(vWmUV, vWmSurf.x));
wmNrm = texture(wmNormalArr, vec3(vWmUV, vWmSurf.y));
wmRough = clamp(vWmSurf.z * wmAlb.a * 2.0, 0.03, 1.0);
wmMetal = vWmSurf.w;
{
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
  vec3 wmTint = vColor.rgb;
#else
  vec3 wmTint = vec3(1.0);
#endif
  float wmE = vWmEmit > 0.0 ? vWmEmit * wmParams.x : -vWmEmit;
  wmEmissive = toLinearSpace(wmAlb.rgb) * wmTint * (wmE * wmNrm.a * wmParams.z);
}
#endif
`;

const FRAGMENT_UPDATE_ALBEDO = /* glsl */ `
#ifdef WORLDMAT
surfaceAlbedo *= toLinearSpace(wmAlb.rgb);
#endif
`;

const FRAGMENT_UPDATE_METALLICROUGHNESS = /* glsl */ `
#ifdef WORLDMAT
metallicRoughness.r = wmMetal;
metallicRoughness.g = wmRough;
#endif
`;

const FRAGMENT_UPDATE_ALPHA = /* glsl */ `
#ifdef WORLDMAT
{
  vec3 wmTn = wmNrm.xyz * 2.0 - 1.0;
  wmTn.xy *= wmParams.y;
  normalW = wmPerturbNormal(normalW, vPositionW, vWmUV, wmTn);
}
#ifdef WORLDMAT_GLASS
{
  float wmF = 1.0 - clamp(abs(dot(normalW, viewDirectionW)), 0.0, 1.0);
  wmF = wmF * wmF * wmF;
  float wmDirt = 1.0 - dot(wmAlb.rgb, vec3(0.299, 0.587, 0.114));
  alpha = clamp(mix(alpha, alpha * 2.2 + 0.25, wmF) + wmDirt * 0.6, 0.0, 1.0);
  surfaceAlbedo *= mix(vec3(1.0), vec3(0.70, 0.88, 0.80), wmF);
}
#endif
#endif
`;

const FRAGMENT_BEFORE_FINAL = /* glsl */ `
#ifdef WORLDMAT
finalEmissive += wmEmissive;
#endif
`;

/** Plugin injecting texture-array sampling into a PBRMaterial (opaque world or glass). */
export class WorldMaterialPlugin extends MaterialPluginBase {
  private lib: TextureLibrary;
  private readonly glass: boolean;
  /** Mains power 0..1: scales emissive of mains-powered surfaces (surf.w > 0). */
  power = 1;
  /** Global normal-map strength multiplier (debug/tuning). */
  normalScale = 1;
  /** Global emissive multiplier (tuning for the tone mapper / bloom threshold). */
  emissiveScale = 1;

  constructor(material: PBRMaterial, lib: TextureLibrary, glass: boolean) {
    super(material, glass ? "WorldGlass" : "WorldMaterial", 210, { WORLDMAT: false, WORLDMAT_GLASS: false }, true, true);
    this.lib = lib;
    this.glass = glass;
  }

  override getClassName(): string {
    return "WorldMaterialPlugin";
  }

  /** Swap the texture library (rebinds on the next frame). */
  setLibrary(lib: TextureLibrary): void {
    this.lib = lib;
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, _mesh: AbstractMesh): void {
    defines["WORLDMAT"] = true;
    defines["WORLDMAT_GLASS"] = this.glass;
  }

  override getAttributes(attributes: string[], _scene: Scene, _mesh: AbstractMesh): void {
    if (!attributes.includes("surf")) attributes.push("surf");
    if (!attributes.includes("uv")) attributes.push("uv");
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("wmAlbedoArr", "wmNormalArr");
  }

  override getUniforms(): { ubo: Array<{ name: string; size: number; type: string }>; fragment: string } {
    return {
      ubo: [{ name: "wmParams", size: 4, type: "vec4" }],
      fragment: "#ifdef WORLDMAT\nuniform vec4 wmParams;\n#endif",
    };
  }

  override isReadyForSubMesh(_defines: MaterialDefines, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): boolean {
    return this.lib.albedo.isReady() && this.lib.normal.isReady();
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    uniformBuffer.updateFloat4("wmParams", this.power, this.normalScale, this.emissiveScale, 0);
    uniformBuffer.setTexture("wmAlbedoArr", this.lib.albedo);
    uniformBuffer.setTexture("wmNormalArr", this.lib.normal);
  }

  override hasTexture(texture: BaseTexture): boolean {
    return texture === this.lib.albedo || texture === this.lib.normal;
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(this.lib.albedo, this.lib.normal);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFS,
        CUSTOM_VERTEX_MAIN_END: VERTEX_MAIN_END,
      };
    }
    if (shaderType === "fragment") {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: FRAGMENT_DEFS,
        CUSTOM_FRAGMENT_MAIN_BEGIN: FRAGMENT_MAIN_BEGIN,
        CUSTOM_FRAGMENT_UPDATE_ALBEDO: FRAGMENT_UPDATE_ALBEDO,
        CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: FRAGMENT_UPDATE_METALLICROUGHNESS,
        CUSTOM_FRAGMENT_UPDATE_ALPHA: FRAGMENT_UPDATE_ALPHA,
        CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: FRAGMENT_BEFORE_FINAL,
      };
    }
    return null;
  }
}

export interface WorldMaterialHandle {
  material: PBRMaterial;
  plugin: WorldMaterialPlugin;
}

/** Create the shared opaque world material. */
export function createWorldMaterial(scene: Scene, lib: TextureLibrary, name = "worldMaterial"): WorldMaterialHandle {
  const m = new PBRMaterial(name, scene);
  m.metallic = 0; // non-null metallic/roughness → METALLICWORKFLOW (values overridden per pixel)
  m.roughness = 1;
  m.albedoColor = Color3.White();
  m.maxSimultaneousLights = 8;
  // per-pixel irradiance so environment diffuse uses the perturbed normal
  m.forceIrradianceInFragment = true;
  m.backFaceCulling = true;
  const plugin = new WorldMaterialPlugin(m, lib, false);
  lib.onRebuild(() => m.markAsDirty(1 /* Material.TextureDirtyFlag */));
  return { material: m, plugin };
}
