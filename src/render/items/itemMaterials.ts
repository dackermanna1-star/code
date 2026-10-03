/**
 * Material factory for item visuals (G-buffer world items, forward hand items, icon renders),
 * sharing programs and uniform objects with the renderer so that block textures, sun, sky
 * and shadows stay in sync automatically.
 */
import * as THREE from 'three';
import type { Renderer } from '../renderer';
import { ENTITY_SHARED } from '../entityMaterial';
import { itemShaderSource, type ItemLayout, type ItemOutput } from './itemShaders';

export interface ItemMatSpec {
  map?: THREE.Texture | null;
  pbrMap?: THREE.Texture | null;
  /** sRGB colour multiplier (0xRRGGBB). */
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  sss?: number;
  vertexColors?: boolean;
  arm?: boolean;
  alphaTest?: number;
  side?: THREE.Side;
  /** Key used to share forward/icon materials (omit for unique). */
  key?: string;
}

export type BlockLayerKind = 'opaque' | 'cutout' | 'translucent';

const WHITE = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/** Studio lighting for icon renders (camera-space directions are set per render). */
export const ICON_LIGHTS = {
  u_keyDir: { value: new THREE.Vector3(0.25, 0.85, 0.55).normalize() },
  u_keyColor: { value: new THREE.Color(1.8, 1.76, 1.68) },
  u_fillDir: { value: new THREE.Vector3(-0.6, 0.2, -0.4).normalize() },
  u_fillColor: { value: new THREE.Color(0.25, 0.28, 0.36) },
  u_ambTop: { value: new THREE.Color(0.6, 0.62, 0.68) },
  u_ambBottom: { value: new THREE.Color(0.3, 0.28, 0.26) },
  u_exposure: { value: 1.3 },
};

export class ItemMaterials {
  /** Shared animation time (glint, flicker). */
  readonly time = { value: 0 };
  /** Light at the first-person hand (sky, r, g, b in 0..1). */
  readonly handLight = { value: new THREE.Vector4(1, 0, 0, 0) };
  /** Camera rotation for the hand pass (camera-relative world vectors). */
  readonly handViewInvRot = { value: new THREE.Matrix3() };
  readonly iconViewInvRot = { value: new THREE.Matrix3() };
  readonly outScale = { value: 1 };
  private forwardCache = new Map<string, THREE.RawShaderMaterial>();
  private iconCache = new Map<string, THREE.RawShaderMaterial>();
  private terrainCache = new Map<string, THREE.RawShaderMaterial>();
  private atmoGlsl: string | null = null;

  constructor(readonly renderer: Renderer) {}

  private baseUniforms(spec: ItemMatSpec): Record<string, THREE.IUniform> {
    return {
      u_map: { value: spec.map ?? WHITE },
      u_hasMap: { value: spec.map ? 1 : 0 },
      u_pbrMap: { value: spec.pbrMap ?? WHITE },
      u_hasPbr: { value: spec.pbrMap ? 1 : 0 },
      u_color: { value: new THREE.Color(spec.color ?? 0xffffff) },
      u_roughness: { value: spec.roughness ?? 0.62 },
      u_metalness: { value: spec.metalness ?? 0 },
      u_emissive: { value: spec.emissive ?? 0 },
      u_sss: { value: spec.sss ?? 0 },
      u_alphaTest: { value: spec.alphaTest ?? 0 },
      u_glint: { value: 0 },
      u_opacity: { value: 1 },
      u_time: this.time,
    };
  }

  private terrainUniforms(): Record<string, THREE.IUniform> {
    const tu = this.renderer.terrainUniforms;
    return { u_albedo: tu.u_albedo, u_normalTex: tu.u_normalTex, u_props: tu.u_props, u_texSize: tu.u_texSize, u_wind: { value: 0 } };
  }

  private forwardUniforms(): Record<string, THREE.IUniform> {
    const lu = this.renderer.lightUniforms;
    const atmo = this.renderer.atmosphere;
    return {
      ...(atmo?.uniforms ?? {}),
      u_lightDir: lu.u_lightDir, u_lightColor: lu.u_lightColor, u_sh: lu.u_sh, u_cameraPos: lu.u_cameraPos,
      u_minAmbient: lu.u_minAmbient, u_nightVision: lu.u_nightVision, u_skyLightScale: lu.u_skyLightScale,
      u_dimAmbient: lu.u_dimAmbient, u_frame: lu.u_frame,
      u_shadowMap: lu.u_shadowMap, u_shadowMat: lu.u_shadowMat, u_shadowRects: lu.u_shadowRects, u_cascadeRadius: lu.u_cascadeRadius,
      u_shadowTexel: lu.u_shadowTexel, u_shadowEnabled: lu.u_shadowEnabled, u_shadowSoftness: lu.u_shadowSoftness,
      u_light: this.handLight,
      u_outScale: this.outScale,
      u_viewInvRot: this.handViewInvRot,
    };
  }

  private atmosphereGlsl(): string | undefined {
    if (this.atmoGlsl === null) this.atmoGlsl = this.renderer.atmosphere?.glsl ?? '';
    return this.atmoGlsl || undefined;
  }

  private make(output: ItemOutput, layout: ItemLayout, spec: ItemMatSpec, uniforms: Record<string, THREE.IUniform>, extra: { cutout?: boolean; translucent?: boolean; flat?: boolean } = {}) {
    const src = itemShaderSource({ output, layout, vertexColors: spec.vertexColors, arm: spec.arm, atmosphere: output === 'forward' ? this.atmosphereGlsl() : undefined, ...extra });
    const m = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: src.vertexShader,
      fragmentShader: src.fragmentShader,
      uniforms,
      side: spec.side ?? (extra.cutout || extra.translucent ? THREE.DoubleSide : THREE.FrontSide),
    });
    if (output !== 'gbuffer' && (extra.translucent || (spec.map && !spec.alphaTest && output === 'forward'))) {
      m.transparent = true;
      m.blending = THREE.CustomBlending;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.blendSrcAlpha = THREE.OneFactor;
      m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      m.depthWrite = !extra.translucent;
    }
    return m;
  }

  /** G-buffer item material. Always a new instance (per-entity `u_light`). */
  gbuffer(spec: ItemMatSpec): THREE.RawShaderMaterial {
    return this.make('gbuffer', 'standard', spec, { ...this.baseUniforms(spec), u_light: { value: new THREE.Vector4(1, 0, 0, 0) }, u_viewInvRot: ENTITY_SHARED.u_viewInvRot });
  }

  /** Forward (hand) material; shared when `spec.key` is set. */
  forward(spec: ItemMatSpec): THREE.RawShaderMaterial {
    const k = spec.key;
    if (k && this.forwardCache.has(k)) return this.forwardCache.get(k)!;
    const m = this.make('forward', 'standard', spec, { ...this.baseUniforms(spec), ...this.forwardUniforms() });
    if (k) this.forwardCache.set(k, m);
    return m;
  }

  /** Icon render material. */
  icon(spec: ItemMatSpec): THREE.RawShaderMaterial {
    const k = spec.key;
    if (k && this.iconCache.has(k)) return this.iconCache.get(k)!;
    const m = this.make('icon', 'standard', spec, { ...this.baseUniforms(spec), ...ICON_LIGHTS, u_viewInvRot: this.iconViewInvRot });
    if (k) this.iconCache.set(k, m);
    return m;
  }

  /** Block (terrain-layout) material for an output. G-buffer variants are per instance. */
  terrain(output: ItemOutput, kind: BlockLayerKind, opts: { flat?: boolean } = {}): THREE.RawShaderMaterial {
    const key = `${output}|${kind}|${opts.flat ? 1 : 0}`;
    if (output !== 'gbuffer' && this.terrainCache.has(key)) return this.terrainCache.get(key)!;
    const extra = { cutout: kind === 'cutout', translucent: kind === 'translucent', flat: opts.flat };
    let uniforms: Record<string, THREE.IUniform>;
    if (output === 'gbuffer') uniforms = { ...this.baseUniforms({}), ...this.terrainUniforms(), u_light: { value: new THREE.Vector4(1, 0, 0, 0) }, u_viewInvRot: ENTITY_SHARED.u_viewInvRot };
    else if (output === 'forward') uniforms = { ...this.baseUniforms({}), ...this.terrainUniforms(), ...this.forwardUniforms() };
    else uniforms = { ...this.baseUniforms({}), ...this.terrainUniforms(), ...ICON_LIGHTS, u_viewInvRot: this.iconViewInvRot };
    // translucent blocks are drawn as cutout in the G-buffer (like createBlockMesh)
    const m = this.make(output, 'terrain', {}, uniforms, output === 'gbuffer' && kind === 'translucent' ? { cutout: true } : extra);
    if (output !== 'gbuffer') this.terrainCache.set(key, m);
    return m;
  }
}
