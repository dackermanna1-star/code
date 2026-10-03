/**
 * Mob materials: `createEntityMaterial` (G-buffer MRT, hurt flash, light, wounds, blood type)
 * extended — without touching the core shader file — with:
 *   - a PBR map (tangent-space normal, roughness, AO) using a derivative-based cotangent frame,
 *   - per-texel subsurface from the albedo alpha,
 *   - an optional extra map (emissive, metalness),
 *   - a colour overlay `u_tint` (creeper white flash, effects).
 * The patch injects code right after the shader's `g0/g1/g2 = ...` writes, so it keeps working
 * if the base shader evolves (each feature is skipped if its anchor is missing).
 */
import * as THREE from 'three';
import { createEntityMaterial, type EntityMaterialOptions } from '../../render/entityMaterial';

export interface MobMaterialOptions extends EntityMaterialOptions {
  pbrMap?: THREE.Texture | null;
  extraMap?: THREE.Texture | null;
  /** Albedo alpha holds the per-texel subsurface mask. */
  sssFromAlpha?: boolean;
  normalScale?: number;
  /** Enable the u_tint overlay. */
  tint?: boolean;
  /** Roughness multiplier when a PBR map is used. */
  roughMul?: number;
}

const DECLS = /* glsl */ `
uniform sampler2D u_pbrMap;
uniform sampler2D u_extraMap;
uniform float u_normalScale;
uniform float u_emScale;
uniform vec4 u_tint;
vec3 mobPerturbNormal(vec3 N, vec2 nm) {
  vec3 tn = vec3((nm * 2.0 - 1.0) * u_normalScale, 1.0);
  vec3 dp1 = dFdx(v_rel), dp2 = dFdy(v_rel);
  vec2 duv1 = dFdx(v_uv), duv2 = dFdy(v_uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float m = max(dot(T, T), dot(B, B));
  if (m < 1e-30) return N;
  float invmax = inversesqrt(m);
  vec3 p = normalize(mat3(T * invmax, B * invmax, N) * tn);
  return (p.x == p.x && dot(p, N) > 0.0) ? p : N;
}
`;

/** Insert `code` after the statement that starts with `anchor` (regex) — returns null if missing. */
function after(src: string, anchor: RegExp, code: string): string | null {
  const m = anchor.exec(src);
  if (!m) return null;
  const end = src.indexOf(';', m.index);
  if (end < 0) return null;
  return src.slice(0, end + 1) + '\n' + code + '\n' + src.slice(end + 1);
}

let warned = false;
function patchFragment(src: string): string {
  let s = src;
  // declarations go right before main()
  const mi = s.search(/void\s+main\s*\(\s*\)/);
  if (mi < 0) return src;
  s = s.slice(0, mi) + DECLS + s.slice(mi);
  const steps: [RegExp, string][] = [
    [/\bg0\s*=\s*vec4\(/, `#ifdef USE_TINT\n  g0.rgb = sqrt(clamp(mix(g0.rgb * g0.rgb, u_tint.rgb, u_tint.a), 0.0, 1.0));\n#endif\n#ifdef USE_SSS_MAP\n  g0.a *= texture(u_map, v_uv).a;\n#endif`],
    [/\bg1\s*=\s*vec4\(/, `#ifdef USE_PBR_MAP\n  { vec4 pbrS = texture(u_pbrMap, v_uv); g1.xyz = mobPerturbNormal(normalize(g1.xyz), pbrS.rg); g1.w = clamp(g1.w * pbrS.b * 2.0, 0.03, 1.0); }\n#endif`],
    [/\bg2\s*=\s*vec4\(/, `#ifdef USE_PBR_MAP\n  g2.b *= texture(u_pbrMap, v_uv).a;\n#endif\n#ifdef USE_EXTRA_MAP\n  { vec4 exS = texture(u_extraMap, v_uv); g2.g += exS.r * u_emScale; g2.r = max(g2.r, exS.g); }\n#endif`],
  ];
  for (const [re, code] of steps) {
    const r = after(s, re, code);
    if (r) s = r;
    else if (!warned) { warned = true; console.warn('[mobs] entity shader anchor missing, PBR feature disabled', re); }
  }
  return s;
}

export function createMobMaterial(o: MobMaterialOptions = {}): THREE.RawShaderMaterial {
  const usePbr = !!o.pbrMap;
  const m = createEntityMaterial(o);
  // with a PBR map, u_roughness acts as a 0.5-centred multiplier of the painted roughness
  if (usePbr) m.uniforms.u_roughness.value = 0.5 * (o.roughMul ?? 1);
  const defs: string[] = [];
  if (usePbr) defs.push('#define USE_PBR_MAP');
  if (o.extraMap) defs.push('#define USE_EXTRA_MAP');
  if (o.sssFromAlpha && o.map) defs.push('#define USE_SSS_MAP');
  if (o.tint) defs.push('#define USE_TINT');
  m.fragmentShader = defs.join('\n') + '\n' + patchFragment(m.fragmentShader);
  m.uniforms.u_pbrMap = { value: o.pbrMap ?? null };
  m.uniforms.u_extraMap = { value: o.extraMap ?? null };
  m.uniforms.u_normalScale = { value: o.normalScale ?? 1 };
  m.uniforms.u_emScale = { value: 1 };
  m.uniforms.u_tint = { value: new THREE.Vector4(1, 1, 1, 0) };
  m.needsUpdate = true;
  return m;
}

/** DataTexture from RGBA8 data with mipmaps + anisotropy (atlas textures). */
export function atlasTexture(data: Uint8Array, W: number, H: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}
