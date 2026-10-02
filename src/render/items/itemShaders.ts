/**
 * Item shaders. One source, three outputs × two vertex layouts:
 *
 *   outputs:  GBUFFER (dropped / thrown / third-person items: same 4 MRTs as terrain/entities)
 *             FORWARD (first-person hand pass: HDR radiance lit by the sun, sky SH, CSM
 *                      shadows and the propagated block/sky light at the hand)
 *             ICON    (studio-lit inventory icons: tonemapped sRGB, premultiplied alpha)
 *   layouts:  standard (position/normal/uv[/color]) — extruded sprites, tool models, the arm
 *             terrain  (a_pos/a_tex/a_light/a_color from the chunk mesher) — block items,
 *                      sampling the terrain albedo/normal/props texture arrays.
 *
 * `ARM` swaps the albedo for a procedural skin + cyan cloth sleeve (Steve's arm).
 */
import { GLSL_COMMON, GLSL_SHADOWS } from '../shaders/common';
import { GLSL_TERRAIN_VERTEX_COMMON } from '../shaders/terrain';

export type ItemOutput = 'gbuffer' | 'forward' | 'icon';
export type ItemLayout = 'standard' | 'terrain';

export interface ItemShaderOptions {
  output: ItemOutput;
  layout: ItemLayout;
  /** Vertex colours (standard layout). */
  vertexColors?: boolean;
  /** Procedural skin/sleeve (Steve's arm). */
  arm?: boolean;
  /** Atmosphere GLSL (forward output: sky reflections + cloud shadows). */
  atmosphere?: string;
  /** Alpha-tested cutout (terrain layout). */
  cutout?: boolean;
  /** Translucent (terrain layout: glass/ice in hand or icons). */
  translucent?: boolean;
  /** Flat icon (no lighting, used for plant/rail/torch sprites). */
  flat?: boolean;
}

const VERT_STANDARD = /* glsl */ `
in vec3 position;
in vec3 normal;
in vec2 uv;
#ifdef USE_COLOR
in vec3 color;
#endif
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 u_viewInvRot;
out vec3 v_normal;
out vec2 v_uv;
out vec3 v_rel;
out vec4 v_color;
out vec3 v_local;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  v_rel = u_viewInvRot * mv.xyz;
  v_normal = normalize(mat3(modelMatrix) * normal);
  v_uv = uv;
  v_local = position;
#ifdef USE_COLOR
  v_color = vec4(color, 1.0);
#else
  v_color = vec4(1.0);
#endif
}
`;

const VERT_TERRAIN = /* glsl */ `
${GLSL_TERRAIN_VERTEX_COMMON}
uniform mat3 u_viewInvRot;
out vec3 v_normal;
out vec2 v_uv;
out vec3 v_rel;
out vec4 v_color;
out vec3 v_local;
flat out uint v_layer;
flat out uint v_flags;
void main() {
  vec3 local = decodeLocal();
  vec4 mv = modelViewMatrix * vec4(local, 1.0);
  gl_Position = projectionMatrix * mv;
  v_rel = u_viewInvRot * mv.xyz;
  v_normal = normalize(mat3(modelMatrix) * decodeNormal());
  v_uv = vec2(a_tex.xy) / 4096.0;
  v_layer = a_tex.z;
  v_flags = a_tex.w;
  v_color = a_color;
  v_local = local;
}
`;

const FRAG_HEAD = /* glsl */ `
in vec3 v_normal;
in vec2 v_uv;
in vec3 v_rel;
in vec4 v_color;
in vec3 v_local;
#ifdef TERRAIN
flat in uint v_layer;
flat in uint v_flags;
uniform sampler2DArray u_albedo;
uniform sampler2DArray u_normalTex;
uniform sampler2D u_props;
uniform float u_texSize;
#else
uniform sampler2D u_map;
uniform float u_hasMap;
uniform sampler2D u_pbrMap;
uniform float u_hasPbr;
#endif
uniform vec3 u_color;
uniform float u_roughness;
uniform float u_metalness;
uniform float u_emissive;
uniform float u_sss;
uniform float u_alphaTest;
uniform float u_glint;
uniform float u_time;
uniform float u_opacity;

struct Surface { vec3 albedo; float alpha; vec3 N; float rough; float metal; float emissive; float sss; float ao; };

float glintPattern(vec3 p, float t) {
  // Minecraft's enchantment glint: two skewed stripe layers scrolling at different speeds
  float a = sin(dot(p, vec3(7.0, 2.4, 3.1)) + t * 2.1);
  float b = sin(dot(p, vec3(-2.2, 7.5, 1.7)) - t * 1.4);
  return pow(max(a, 0.0), 8.0) * 0.75 + pow(max(b, 0.0), 8.0) * 0.6;
}

#ifdef ARM
// Steve's arm in Minecraft model units (1/16 block, y down the arm): cyan sleeve over y<2, skin below.
vec3 armAlbedo(vec3 lp, out float rough, out float sss) {
  vec3 p = lp * 16.0;
  float sleeve = 1.0 - smoothstep(1.7, 2.3, p.y + vnoise(p.xz * 3.0) * 0.25);
  vec3 skin = srgbToLinear(vec3(0.72, 0.53, 0.42));
  // pores, blotches and knuckle shading
  float n = vnoise3(p * 6.0) * 0.6 + vnoise3(p * 17.0) * 0.4;
  skin *= 0.9 + n * 0.16;
  skin = mix(skin, skin * vec3(1.08, 0.86, 0.82), smoothstep(0.55, 0.9, vnoise3(p * 1.7)) * 0.35);
  float knuckle = smoothstep(9.0, 10.0, p.y) * (0.5 + 0.5 * sin(p.x * 4.7 + 1.4));
  skin *= 1.0 - knuckle * 0.08;
  vec3 cloth = srgbToLinear(vec3(0.0, 0.62, 0.64));
  float weave = 0.5 + 0.5 * sin(p.x * 22.0) * sin(p.y * 22.0 + p.z * 22.0);
  cloth *= 0.82 + weave * 0.12 + vnoise3(p * 9.0) * 0.12;
  float hem = smoothstep(1.2, 1.8, p.y) * (1.0 - smoothstep(1.8, 2.3, p.y));
  cloth *= 1.0 - hem * 0.25;
  rough = mix(0.52 - n * 0.08, 0.92, sleeve);
  sss = mix(0.55, 0.05, sleeve);
  return mix(skin, cloth, sleeve);
}
#endif

Surface getSurface() {
  Surface s;
  vec3 N0 = normalize(v_normal);
  if (!gl_FrontFacing) N0 = -N0;
  s.N = N0;
  s.ao = 1.0;
  s.sss = u_sss;
#ifdef TERRAIN
  float layer = float(v_layer);
  vec2 uv = v_uv;
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec4 alb = textureGrad(u_albedo, vec3(uv, layer), duv1, duv2);
  vec4 nt = textureGrad(u_normalTex, vec3(uv, layer), duv1, duv2);
  vec4 props = texelFetch(u_props, ivec2(int(v_layer), 0), 0);
#if defined(CUTOUT) || defined(TRANSLUCENT)
  float tintMask = 1.0;
#else
  float tintMask = alb.a;
#endif
#ifdef CUTOUT
  if (alb.a < 0.5) discard;
#endif
  vec3 albedo = srgbToLinear(alb.rgb) * mix(vec3(1.0), srgbToLinear(v_color.rgb), tintMask);
  s.albedo = albedo * u_color;
#ifdef TRANSLUCENT
  s.alpha = max(alb.a, 0.18);
#else
  s.alpha = 1.0;
#endif
  vec3 dp1 = dFdx(v_rel), dp2 = dFdy(v_rel);
  vec3 dp2perp = cross(dp2, N0), dp1perp = cross(N0, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  T *= invmax; B *= invmax;
  vec2 nxy = nt.xy * 2.0 - 1.0;
  vec3 tn = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  vec3 N = T * tn.x + B * tn.y + N0 * tn.z;
  float l2 = dot(N, N);
  s.N = (l2 > 1e-6 && l2 < 1e6) ? N * inversesqrt(l2) : N0;
  s.rough = clamp(nt.w, 0.03, 1.0);
  s.metal = props.r;
  float lum = luminance(alb.rgb);
  s.emissive = props.g * (props.b > 0.0 ? smoothstep(props.b, min(1.0, props.b + 0.15), lum) : 1.0);
  s.sss = max(s.sss, props.a);
  s.ao = v_color.a * mix(0.6, 1.0, smoothstep(0.0, 0.6, nt.z));
#else
  vec4 tex = u_hasMap > 0.5 ? texture(u_map, v_uv) : vec4(1.0);
  if (tex.a < u_alphaTest) discard;
  s.albedo = srgbToLinear(tex.rgb) * u_color * v_color.rgb;
  s.alpha = u_hasMap > 0.5 && u_alphaTest <= 0.0 ? tex.a : 1.0;
  if (u_hasPbr > 0.5) {
    vec4 pm = texture(u_pbrMap, v_uv);
    s.metal = pm.r;
    s.rough = clamp(pm.g * u_roughness / 0.62, 0.04, 1.0);
    s.emissive = pm.b + u_emissive;
  } else {
    s.metal = u_metalness;
    s.rough = u_roughness;
    s.emissive = u_emissive;
  }
#ifdef ARM
  float ar, as;
  s.albedo = armAlbedo(v_local, ar, as);
  s.rough = ar;
  s.sss = as;
  s.metal = 0.0;
#endif
#endif
  return s;
}
`;

const OUT_GBUFFER = /* glsl */ `
layout(location = 0) out vec4 g0;
layout(location = 1) out vec4 g1;
layout(location = 2) out vec4 g2;
layout(location = 3) out vec4 g3;
uniform vec4 u_light;
void main() {
  Surface s = getSurface();
  float em = s.emissive;
  vec3 albedo = s.albedo;
  if (u_glint > 0.0) {
    float gl = glintPattern(v_local, u_time) * u_glint;
    albedo = mix(albedo, vec3(0.55, 0.28, 1.0), gl * 0.5);
    em += gl * 0.12;
  }
  g0 = vec4(sqrt(clamp(albedo, 0.0, 1.0)), s.sss);
  g1 = vec4(s.N, s.rough);
  g2 = vec4(s.metal, em, s.ao, 4.0 / 255.0);
  g3 = u_light;
}
`;

const OUT_FORWARD = /* glsl */ `
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sh[9];
uniform vec3 u_cameraPos;
uniform float u_minAmbient;
uniform float u_nightVision;
uniform float u_skyLightScale;
uniform vec3 u_dimAmbient;
uniform float u_frame;
/** Light at the hand: sky (0..1), block R, G, B (0..1), smoothed by the hand renderer. */
uniform vec4 u_light;
/** Exposure-independent encode scale for the RGBA8-free path (1 = raw HDR). */
uniform float u_outScale;
out vec4 o;
void main() {
  Surface s = getSurface();
  vec3 N = s.N;
  vec3 rel = v_rel;
  float dist = max(length(rel), 1e-4);
  vec3 V = -rel / dist;
  vec3 L = u_lightDir;
  float NoL = dot(N, L);
  vec3 H = normalize(V + L);
  float NoV = max(dot(N, V), 1e-3);
  float NoH = max(dot(N, H), 0.0);
  float LoH = max(dot(L, H), 0.0);
  float alpha = max(s.rough * s.rough, 0.002);
  vec3 f0 = mix(vec3(0.04), s.albedo, s.metal);
  vec3 diffColor = s.albedo * (1.0 - s.metal);
  float skyL = u_light.x * u_skyLightScale;
  float skyVis = skyL * skyL;
  float noise = ign(gl_FragCoord.xy + 5.588238 * mod(u_frame, 64.0));
  vec3 direct = vec3(0.0);
  if ((NoL > 0.0 || s.sss > 0.0) && dot(u_lightColor, u_lightColor) > 1e-8) {
    float shadow = sampleShadow(rel, N, L, noise, s.sss) * atmo_cloudShadow(rel + u_cameraPos);
    shadow *= smoothstep(0.02, 0.35, u_light.x);
    if (NoL > 0.0) {
      vec3 F = F_Schlick(f0, LoH);
      vec3 spec = D_GGX(NoH, alpha) * V_SmithGGXCorrelated(NoV, NoL, alpha) * F;
      vec3 diff = diffColor * Fd_Burley(NoV, NoL, LoH, s.rough);
      direct += (diff * (1.0 - F) + spec) * NoL;
    }
    if (s.sss > 0.0) {
      float wrap = max(0.0, (-NoL + 0.6) / 1.6);
      float VoL = dot(V, -L);
      direct += diffColor * s.sss * (wrap * 0.35 + (0.25 + 1.6 * pow(max(VoL, 0.0), 6.0)) * 0.5) / PI * vec3(1.0, 0.55, 0.45);
    }
    direct *= u_lightColor * shadow;
  }
  vec3 irr = shIrradiance(N, u_sh);
  vec3 ambient = diffColor * irr / PI * skyVis * s.ao;
  ambient += diffColor * u_lightColor * 0.018 * skyVis * s.ao * (max(0.0, -N.y) * 0.5 + 0.5) * (0.5 + 0.5 * max(L.y, 0.0));
  ambient += diffColor * u_dimAmbient * s.ao;
  vec3 blk = blockLightRadiance(u_light.yzw);
  float flick = 1.0 + 0.04 * sin(u_time * 9.0) * sin(u_time * 6.3 + 1.0);
  // block light comes from around the player: soft, slightly directional (wrap) lighting
  vec3 blockDiffuse = diffColor * blk * flick * (0.75 + 0.25 * N.y) * s.ao;
  vec3 blockSpec = blk * envBRDFApprox(f0, max(s.rough, 0.3), NoV) * 0.35 * s.ao;
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.85 + 0.15 * R.y;
  vec3 env = mix(atmo_skyRadiance(normalize(R)), irr / PI, smoothstep(0.2, 0.9, s.rough));
  float specOcc = clamp(pow(NoV + s.ao, exp2(-16.0 * s.rough - 1.0)) - 1.0 + s.ao, 0.0, 1.0);
  vec3 specAmb = env * envBRDFApprox(f0, s.rough, NoV) * skyVis * specOcc;
  // metals in dark places still pick up the block light as reflections
  specAmb += blk * envBRDFApprox(f0, s.rough, NoV) * 0.5 * s.metal;
  vec3 emissive = s.albedo * s.emissive * EMISSIVE_SCALE * 0.6;
  vec3 floorAmb = diffColor * (u_minAmbient + u_nightVision * 0.6);
  vec3 color = direct + ambient + blockDiffuse + blockSpec + specAmb + emissive + floorAmb;
  if (u_glint > 0.0) color += vec3(0.5, 0.25, 1.0) * glintPattern(v_local, u_time) * u_glint * (0.15 + luminance(irr) * skyVis * 0.4 + luminance(blk) * 0.3);
  float a = s.alpha * u_opacity;
  o = vec4(color * a * u_outScale, a);
}
`;

const OUT_ICON = /* glsl */ `
uniform vec3 u_keyDir;
uniform vec3 u_keyColor;
uniform vec3 u_fillDir;
uniform vec3 u_fillColor;
uniform vec3 u_ambTop;
uniform vec3 u_ambBottom;
uniform float u_exposure;
out vec4 o;
vec3 studioEnv(vec3 d) {
  float t = d.y * 0.5 + 0.5;
  vec3 c = mix(u_ambBottom * 0.6, u_ambTop * 1.6, smoothstep(0.25, 0.9, t));
  // a soft box light up-left
  c += vec3(2.2) * smoothstep(0.8, 0.97, dot(d, normalize(vec3(-0.5, 0.7, 0.5))));
  return c;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  Surface s = getSurface();
#ifdef FLAT
  vec3 fc = linearToSrgb(s.albedo * 1.02 + s.albedo * s.emissive * 0.4);
  o = vec4(fc * s.alpha, s.alpha);
#else
  vec3 N = s.N;
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 f0 = mix(vec3(0.04), s.albedo, s.metal);
  vec3 diffColor = s.albedo * (1.0 - s.metal);
  float NoV = max(dot(N, V), 1e-3);
  float alpha = max(s.rough * s.rough, 0.002);
  vec3 color = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 L = i == 0 ? u_keyDir : u_fillDir;
    vec3 Lc = i == 0 ? u_keyColor : u_fillColor;
    float NoL = dot(N, L);
    if (NoL <= 0.0) continue;
    vec3 H = normalize(V + L);
    float NoH = max(dot(N, H), 0.0);
    float LoH = max(dot(L, H), 0.0);
    vec3 F = F_Schlick(f0, LoH);
    vec3 spec = D_GGX(NoH, alpha) * V_SmithGGXCorrelated(NoV, NoL, alpha) * F;
    color += (diffColor * Fd_Burley(NoV, NoL, LoH, s.rough) * (1.0 - F) + spec * 0.6) * NoL * Lc;
  }
  vec3 amb = mix(u_ambBottom, u_ambTop, N.y * 0.5 + 0.5);
  color += diffColor * amb * s.ao;
  vec3 R = reflect(-V, N);
  color += studioEnv(R) * envBRDFApprox(f0, s.rough, NoV) * s.ao;
  color += s.albedo * s.emissive * 1.2;
  color = aces(color * u_exposure);
  color = linearToSrgb(color);
  o = vec4(color * s.alpha, s.alpha);
#endif
}
`;

/** Builds GLSL3 vertex/fragment sources for an item material variant. */
export function itemShaderSource(o: ItemShaderOptions): { vertexShader: string; fragmentShader: string } {
  const defs: string[] = [];
  if (o.layout === 'terrain') defs.push('#define TERRAIN');
  if (o.vertexColors) defs.push('#define USE_COLOR');
  if (o.arm) defs.push('#define ARM');
  if (o.cutout) defs.push('#define CUTOUT');
  if (o.translucent) defs.push('#define TRANSLUCENT');
  if (o.flat) defs.push('#define FLAT');
  const head = `precision highp float;\nprecision highp int;\nprecision highp sampler2DArray;\n${defs.join('\n')}\n${GLSL_COMMON}\n`;
  const vertexShader = head + (o.layout === 'terrain' ? VERT_TERRAIN : VERT_STANDARD);
  let out: string;
  if (o.output === 'gbuffer') out = OUT_GBUFFER;
  else if (o.output === 'icon') out = OUT_ICON;
  else {
    const atmo = o.atmosphere ?? `vec3 atmo_skyRadiance(vec3 d){ return mix(vec3(0.05), vec3(0.3,0.45,0.7), clamp(d.y*0.5+0.5,0.0,1.0)); } float atmo_cloudShadow(vec3 p){ return 1.0; }`;
    out = `${atmo}\n${GLSL_SHADOWS}\n${OUT_FORWARD}`;
  }
  const fragmentShader = head + FRAG_HEAD + out;
  return { vertexShader, fragmentShader };
}
