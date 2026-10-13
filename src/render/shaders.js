// GLSL sources. Everything renders palette indices into an R8 target; the
// final pass maps indices through PLAYPAL. Lighting is the original COLORMAP
// light-diminishing model, evaluated per pixel from view depth.

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
`;

const COMMON = `
uniform sampler2D u_images;
uniform sampler2DArray u_atlas;
uniform sampler2D u_colormap;
uniform float u_extralight;
uniform float u_fixedColormap;
uniform vec4 u_lights[8];
uniform float u_lightPower[8];
uniform int u_numLights;
uniform float u_smoothLight;

vec4 imageRect(float id) {
  int i = int(id + 0.5);
  return texelFetch(u_images, ivec2(i % 256, i / 256), 0);
}

vec2 atlasTexel(vec4 rect, ivec2 tc) {
  int packedX = int(rect.x + 0.5);
  int layer = packedX / 2048;
  int ax = packedX - layer * 2048;
  return texelFetch(u_atlas, ivec3(ax + tc.x, int(rect.y + 0.5) + tc.y, layer), 0).rg;
}

float lightLevel(float sectorLight, float depth, float contrast, bool isFlat, vec3 worldPos, bool fullbright) {
  if (u_fixedColormap >= 0.0) return u_fixedColormap;
  if (fullbright) return 0.0;
  float lightnum = clamp(floor(sectorLight / 16.0) + u_extralight + contrast, 0.0, 15.0);
  if (u_smoothLight > 0.5) lightnum = clamp(sectorLight / 16.0 + u_extralight + contrast, 0.0, 15.99);
  float startmap = (15.0 - lightnum) * 4.0;
  // r_main.c: zlight subtracts (160/(j+1))/DISTMAP with j = depth/16 for
  // flats; scalelight subtracts min(rw_scale>>12, 47)/DISTMAP = 1280/depth
  // capped at 23 for walls and sprites, all in integer steps.
  float scale;
  if (isFlat) scale = min(80.0 / (floor(max(depth, 0.0) / 16.0) + 1.0), 24.0);
  else scale = min(1280.0 / max(depth, 1.0), 23.0);
  if (u_smoothLight < 0.5) scale = floor(scale);
  float level = startmap - scale;
  for (int i = 0; i < 8; i++) {
    if (i >= u_numLights) break;
    vec4 L = u_lights[i];
    float d = distance(worldPos, L.xyz);
    float f = clamp(1.0 - d / L.w, 0.0, 1.0);
    level -= u_lightPower[i] * f;
  }
  return clamp(floor(level), 0.0, 31.0);
}

float shade(float idx, float level) {
  return texelFetch(u_colormap, ivec2(int(idx + 0.5), int(level + 0.5)), 0).r;
}

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}
`;

// --- World (walls, flats, decals) --------------------------------------
// Vertex layout: a_pos(2) a_z(3) a_tex(4) a_info(4) = 13 floats
export const WORLD_LAYOUT = [['a_pos', 2], ['a_z', 3], ['a_tex', 4], ['a_info', 4]];
export const WORLD_FLOATS = 13;

export const WORLD_VS = HEADER + COMMON + `
in vec2 a_pos;
in vec3 a_z;     // zSector, zPlane (0 floor, 1 ceiling, 2 absolute), zAdd
in vec4 a_tex;   // u, vSector, vPlane, vAdd
in vec4 a_info;  // surface, lightSector, contrast, flags
uniform mat4 u_view;
uniform mat4 u_proj;
uniform sampler2D u_sectors;
uniform sampler2D u_surfaces;
out vec2 v_uv;
out float v_depth;
out vec3 v_world;
flat out vec4 v_rect;
flat out float v_light;
flat out float v_contrast;
flat out float v_flags;

vec4 sectorData(float s) {
  int i = int(s + 0.5);
  return texelFetch(u_sectors, ivec2(i % 256, i / 256), 0);
}

float planeZ(float sector, float plane, float add) {
  if (plane > 2.5) {
    // Two-sided opening: 3 + 2*other = higher floor, 4 + 2*other = lower
    // ceiling of this sector and 'other' (masked midtextures).
    float k = plane - 3.0;
    float other = floor(k / 2.0);
    vec4 a = sectorData(sector), b = sectorData(other);
    return (k - other * 2.0 < 0.5 ? max(a.x, b.x) : min(a.y, b.y)) + add;
  }
  if (plane > 1.5) return add;
  vec4 s = sectorData(sector);
  return (plane < 0.5 ? s.x : s.y) + add;
}

void main() {
  float z = planeZ(a_z.x, a_z.y, a_z.z);
  int si = int(a_info.x + 0.5);
  vec4 surf = texelFetch(u_surfaces, ivec2(si % 256, si / 256), 0);
  float flags = a_info.w;
  if (mod(floor(flags / 64.0), 2.0) >= 1.0) {
    // Decal: explicit texel coordinates.
    v_uv = vec2(a_tex.x, a_tex.w);
  } else if (mod(flags, 2.0) >= 1.0) {
    // Flat: world aligned 64x64 tiles.
    v_uv = vec2(a_pos.x, -a_pos.y) + surf.yz;
  } else {
    float anchor = planeZ(a_tex.y, a_tex.z, a_tex.w);
    v_uv = vec2(a_tex.x + surf.y, anchor - z + surf.z);
  }
  v_rect = surf.x < 0.0 ? vec4(0.0) : imageRect(surf.x);
  v_flags = flags + surf.w;
  vec4 ls = sectorData(a_info.y);
  v_light = ls.z;
  v_contrast = a_info.z;
  vec4 world = vec4(a_pos.x, z, -a_pos.y, 1.0);
  vec4 viewPos = u_view * world;
  v_depth = -viewPos.z;
  v_world = vec3(a_pos.x, a_pos.y, z);
  gl_Position = u_proj * viewPos;
}
`;

export const WORLD_FS = HEADER + COMMON + `
in vec2 v_uv;
in float v_depth;
in vec3 v_world;
flat in vec4 v_rect;
flat in float v_light;
flat in float v_contrast;
flat in float v_flags;
out vec4 o_color;

bool bit(float flags, float b) { return mod(floor(flags / b), 2.0) >= 1.0; }

void main() {
  vec2 size = v_rect.zw;
  if (size.x < 1.0) discard;
  bool isFlat = bit(v_flags, 1.0) || bit(v_flags, 128.0);
  bool masked = bit(v_flags, 2.0);
  bool noVWrap = bit(v_flags, 4.0);
  bool decal = bit(v_flags, 16.0);
  bool fullbright = bit(v_flags, 32.0);
  vec2 uv = v_uv;
  if (noVWrap && (uv.y < 0.0 || uv.y >= size.y)) discard;
  if (decal && (uv.x < 0.0 || uv.x >= size.x || uv.y < 0.0 || uv.y >= size.y)) discard;
  ivec2 tc = ivec2(mod(floor(uv), size));
  vec2 t = atlasTexel(v_rect, tc);
  if ((masked || decal) && t.g < 0.5) discard;
  float idx = floor(t.r * 255.0 + 0.5);
  float level = lightLevel(v_light, v_depth, v_contrast, isFlat, v_world, fullbright);
  o_color = vec4(shade(idx, level), 0.0, 0.0, 1.0);
}
`;

export const SKY_FS = HEADER + COMMON + `
in vec2 v_uv;
in float v_depth;
in vec3 v_world;
flat in vec4 v_rect;
flat in float v_light;
flat in float v_contrast;
flat in float v_flags;
uniform vec3 u_camPos;
uniform float u_skyImage;
uniform float u_skyTop;
out vec4 o_color;
void main() {
  vec4 rect = imageRect(u_skyImage);
  vec3 d = v_world - u_camPos;
  float ang = atan(d.y, d.x);
  float col = ang / 6.28318530718 * 1024.0;
  float elev = atan(d.z, length(d.xy));
  float row = 100.0 - 160.0 * tan(clamp(elev, -1.3, 1.3));
  float idx;
  float fade = clamp(-row / 56.0, 0.0, 1.0);
  if (fade > bayer4(gl_FragCoord.xy)) {
    idx = u_skyTop;
  } else {
    // Above the texture, mirror it upward while fading to its top colour.
    float r = row < 0.0 ? -row : row;
    ivec2 tc = ivec2(mod(floor(col), rect.z), clamp(floor(r), 0.0, rect.w - 1.0));
    idx = floor(atlasTexel(rect, tc).r * 255.0 + 0.5);
  }
  // As in r_plane.c the sky is always drawn with colormap 0 (no invulnerability inversion).
  o_color = vec4(idx / 255.0, 0.0, 0.0, 1.0);
}
`;

// --- Sprites & particles (world space billboards) -------------------------
// a_pos(3) a_uv(2) a_image(1) a_light(1) a_color(1) a_flags(1) a_alpha(1) a_center(3) a_clip(1) = 14
// a_center is the sprite origin: the whole billboard takes its depth, like
// the original renderer's single per-sprite scale, so sprites near walls
// aren't sliced by the geometry behind them.
// a_clip discards pixels above a world height (dismemberment).
export const SPRITE_LAYOUT = [['a_pos', 3], ['a_uv', 2], ['a_image', 1], ['a_light', 1], ['a_color', 1], ['a_flags', 1], ['a_alpha', 1], ['a_center', 3], ['a_clip', 1]];
export const SPRITE_FLOATS = 14;

export const SPRITE_VS = HEADER + COMMON + `
in vec3 a_pos;
in vec2 a_uv;
in float a_image;
in float a_light;
in float a_color;
in float a_flags;
in float a_alpha;
in vec3 a_center;
in float a_clip;
uniform mat4 u_view;
uniform mat4 u_proj;
out vec2 v_uv;
out float v_depth;
out vec3 v_world;
flat out vec4 v_rect;
flat out float v_light;
flat out float v_color;
flat out float v_flags;
flat out float v_alpha;
flat out float v_clip;
void main() {
  v_uv = a_uv;
  v_rect = a_image >= 0.0 ? imageRect(a_image) : vec4(0.0);
  v_light = a_light;
  v_color = a_color;
  v_flags = a_flags;
  v_alpha = a_alpha;
  v_clip = a_clip;
  vec4 viewPos = u_view * vec4(a_pos.x, a_pos.z, -a_pos.y, 1.0);
  vec4 centerView = u_view * vec4(a_center.x, a_center.z, -a_center.y, 1.0);
  v_depth = max(-centerView.z, 1.0);
  v_world = a_pos;
  gl_Position = u_proj * viewPos;
  // Flatten depth to the sprite origin (slightly toward the camera).
  float cz = min(centerView.z + 2.0, -2.5);
  vec4 cc = u_proj * vec4(centerView.xy, cz, 1.0);
  gl_Position.z = (cc.z / cc.w) * gl_Position.w;
}
`;

export const SPRITE_FS = HEADER + COMMON + `
in vec2 v_uv;
in float v_depth;
in vec3 v_world;
flat in vec4 v_rect;
flat in float v_light;
flat in float v_color;
flat in float v_flags;
flat in float v_alpha;
flat in float v_clip;
uniform sampler2D u_scene;
uniform float u_fuzzPhase;
uniform float u_pixelScale;
out vec4 o_color;
bool bit(float flags, float b) { return mod(floor(flags / b), 2.0) >= 1.0; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  if (v_world.z > v_clip) discard;
  bool fullbright = bit(v_flags, 1.0);
  bool fuzz = bit(v_flags, 2.0);
  bool solid = bit(v_flags, 4.0);
  bool dither = bit(v_flags, 8.0);
  bool isRound = bit(v_flags, 16.0);
  if (dither && v_alpha < bayer4(gl_FragCoord.xy)) discard;
  float idx;
  if (solid) {
    if (isRound && length(v_uv - 0.5) > 0.5) discard;
    idx = v_color;
  } else {
    vec2 size = v_rect.zw;
    if (v_uv.x < 0.0 || v_uv.y < 0.0 || v_uv.x >= size.x || v_uv.y >= size.y) discard;
    vec2 t = atlasTexel(v_rect, ivec2(floor(v_uv)));
    if (t.g < 0.5) discard;
    idx = floor(t.r * 255.0 + 0.5);
  }
  if (fuzz) {
    float row = floor(gl_FragCoord.y / u_pixelScale);
    float off = hash(vec2(floor(gl_FragCoord.x / u_pixelScale), row + u_fuzzPhase)) > 0.5 ? 1.0 : -1.0;
    ivec2 sp = ivec2(gl_FragCoord.xy + vec2(0.0, off * u_pixelScale));
    float base = floor(texelFetch(u_scene, sp, 0).r * 255.0 + 0.5);
    o_color = vec4(shade(base, 6.0), 0.0, 0.0, 1.0);
    return;
  }
  float level = lightLevel(v_light, v_depth, 0.0, false, v_world, fullbright);
  o_color = vec4(shade(idx, level), 0.0, 0.0, 1.0);
}
`;

// --- 2D (weapon sprites, HUD, menus, automap) -----------------------------
// a_pos(2) a_uv(2) a_image(1) a_level(1) a_color(1) a_flags(1) a_trans(1) = 9
export const UI_LAYOUT = [['a_pos', 2], ['a_uv', 2], ['a_image', 1], ['a_level', 1], ['a_color', 1], ['a_flags', 1], ['a_trans', 1]];
export const UI_FLOATS = 9;

export const UI_VS = HEADER + COMMON + `
in vec2 a_pos;
in vec2 a_uv;
in float a_image;
in float a_level;
in float a_color;
in float a_flags;
in float a_trans;
uniform vec2 u_screen;
out vec2 v_uv;
flat out vec4 v_rect;
flat out float v_level;
flat out float v_color;
flat out float v_flags;
flat out float v_trans;
void main() {
  v_uv = a_uv;
  v_rect = a_image >= 0.0 ? imageRect(a_image) : vec4(0.0);
  v_level = a_level;
  v_color = a_color;
  v_flags = a_flags;
  v_trans = a_trans;
  vec2 p = a_pos / u_screen * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}
`;

export const UI_FS = HEADER + COMMON + `
in vec2 v_uv;
flat in vec4 v_rect;
flat in float v_level;
flat in float v_color;
flat in float v_flags;
flat in float v_trans;
uniform sampler2D u_scene;
uniform sampler2D u_translations;
uniform float u_fuzzPhase;
uniform float u_pixelScale;
out vec4 o_color;
bool bit(float flags, float b) { return mod(floor(flags / b), 2.0) >= 1.0; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  bool solid = bit(v_flags, 4.0);
  bool fuzz = bit(v_flags, 2.0);
  bool dither = bit(v_flags, 8.0);
  bool shadeBg = bit(v_flags, 32.0);
  float idx;
  if (solid) {
    idx = v_color;
  } else {
    vec2 size = v_rect.zw;
    if (v_uv.x < 0.0 || v_uv.y < 0.0 || v_uv.x >= size.x || v_uv.y >= size.y) discard;
    vec2 t = atlasTexel(v_rect, ivec2(floor(v_uv)));
    if (t.g < 0.5) discard;
    idx = floor(t.r * 255.0 + 0.5);
  }
  if (dither && v_color < bayer4(gl_FragCoord.xy)) discard;
  if (fuzz || shadeBg) {
    float off = 0.0;
    if (fuzz) {
      float row = floor(gl_FragCoord.y / u_pixelScale);
      off = hash(vec2(floor(gl_FragCoord.x / u_pixelScale), row + u_fuzzPhase)) > 0.5 ? 1.0 : -1.0;
    }
    ivec2 sp = ivec2(gl_FragCoord.xy + vec2(0.0, off * u_pixelScale));
    float base = floor(texelFetch(u_scene, sp, 0).r * 255.0 + 0.5);
    o_color = vec4(shade(base, fuzz ? 6.0 : v_level), 0.0, 0.0, 1.0);
    return;
  }
  if (v_trans > 0.5) idx = floor(texelFetch(u_translations, ivec2(int(idx), int(v_trans + 0.5)), 0).r * 255.0 + 0.5);
  if (v_level >= 0.0) idx = floor(shade(idx, v_level) * 255.0 + 0.5);
  o_color = vec4(idx / 255.0, 0.0, 0.0, 1.0);
}
`;

// --- Final pass: palette lookup, melt wipe, upscale ------------------------
export const FINAL_VS = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const FINAL_FS = HEADER + `
uniform sampler2D u_index;
uniform sampler2D u_oldIndex;
uniform sampler2D u_wipe;
uniform sampler2D u_palette;
uniform float u_paletteRow;
uniform vec4 u_dest;
uniform vec2 u_src;
uniform float u_wipeActive;
uniform float u_gamma;
uniform float u_crt;
out vec4 o_color;
void main() {
  vec2 rel = (gl_FragCoord.xy - u_dest.xy) / u_dest.zw;
  if (rel.x < 0.0 || rel.y < 0.0 || rel.x >= 1.0 || rel.y >= 1.0) { o_color = vec4(0.0, 0.0, 0.0, 1.0); return; }
  ivec2 sp = ivec2(floor(rel * u_src));
  float idx;
  if (u_wipeActive > 0.5) {
    float off = texelFetch(u_wipe, ivec2(sp.x, 0), 0).r;
    float fromTop = u_src.y - 1.0 - float(sp.y);
    if (fromTop < off) {
      idx = texelFetch(u_index, sp, 0).r;
    } else {
      int oy = int(u_src.y - 1.0 - (fromTop - max(off, 0.0)));
      idx = texelFetch(u_oldIndex, ivec2(sp.x, oy), 0).r;
    }
  } else {
    idx = texelFetch(u_index, sp, 0).r;
  }
  int i = int(floor(idx * 255.0 + 0.5));
  vec3 c = texelFetch(u_palette, ivec2(i, int(u_paletteRow)), 0).rgb;
  c = pow(c, vec3(1.0 / u_gamma));
  if (u_crt > 0.5) {
    float line = fract(rel.y * u_src.y);
    c *= 0.82 + 0.18 * smoothstep(0.0, 0.5, abs(line - 0.5) * 2.0 < 0.8 ? 1.0 : 0.0);
  }
  o_color = vec4(c, 1.0);
}
`;

// --- Voxel models (3D monsters and ragdoll parts) ---------------------------
// One instanced box per model part. The fragment shader marches the ray
// through the part's voxels (Amanatides-Woo DDA) in an RG8 3D texture
// (R = palette index, G = part label), writes the true depth of the voxel
// face it hits and lights it with COLORMAP like everything else.
// Per instance: a 3x4 matrix from voxel coordinates to world (rows m0..m2),
// lo.xyz/label, hi.xyz/light, misc = flags, severed-label mask, alpha,
// blood colour.
export const VOX_INSTANCE = [['i_m0', 4], ['i_m1', 4], ['i_m2', 4], ['i_lo', 4], ['i_hi', 4], ['i_misc', 4]];
export const VOX_FLOATS = 24;

export const VOX_VS = HEADER + `
in vec3 a_corner;
in vec4 i_m0;
in vec4 i_m1;
in vec4 i_m2;
in vec4 i_lo;
in vec4 i_hi;
in vec4 i_misc;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform vec3 u_cam;
out vec3 v_vox;
flat out vec3 v_camVox;
flat out vec4 v_m0;
flat out vec4 v_m1;
flat out vec4 v_m2;
flat out vec4 v_lo;
flat out vec4 v_hi;
flat out vec4 v_misc;
void main() {
  vec3 p = mix(i_lo.xyz, i_hi.xyz, a_corner);
  vec4 hp = vec4(p, 1.0);
  vec3 w = vec3(dot(i_m0, hp), dot(i_m1, hp), dot(i_m2, hp));
  // The matrix is a scaled rotation: its inverse is the transpose / s^2.
  vec3 d = u_cam - vec3(i_m0.w, i_m1.w, i_m2.w);
  float s2 = dot(i_m0.xyz, i_m0.xyz);
  v_camVox = (i_m0.xyz * d.x + i_m1.xyz * d.y + i_m2.xyz * d.z) / s2;
  v_vox = p;
  v_m0 = i_m0; v_m1 = i_m1; v_m2 = i_m2;
  v_lo = i_lo; v_hi = i_hi; v_misc = i_misc;
  gl_Position = u_proj * u_view * vec4(w.x, w.z, -w.y, 1.0);
}
`;

export const VOX_FS = HEADER + `precision highp sampler3D;
` + COMMON + `
in vec3 v_vox;
flat in vec3 v_camVox;
flat in vec4 v_m0;
flat in vec4 v_m1;
flat in vec4 v_m2;
flat in vec4 v_lo;
flat in vec4 v_hi;
flat in vec4 v_misc;
uniform highp sampler3D u_vox;
uniform sampler2D u_scene;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform float u_fuzzPhase;
uniform float u_pixelScale;
out vec4 o_color;
bool bit(float flags, float b) { return mod(floor(flags / b), 2.0) >= 1.0; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float alpha = v_misc.z;
  if (alpha < 1.0 && alpha < bayer4(gl_FragCoord.xy)) discard;
  vec3 ro = v_camVox;
  vec3 rd = normalize(v_vox - ro);
  rd = mix(rd, vec3(1e-6), vec3(lessThan(abs(rd), vec3(1e-6))));
  vec3 inv = 1.0 / rd;
  vec3 lo = v_lo.xyz, hi = v_hi.xyz;
  vec3 t0 = (lo - ro) * inv, t1 = (hi - ro) * inv;
  vec3 tmn = min(t0, t1), tmx = max(t0, t1);
  float tn = max(max(tmn.x, tmn.y), tmn.z);
  float tf = min(min(tmx.x, tmx.y), tmx.z);
  float t = max(tn, 0.0);
  if (t >= tf) discard;
  ivec3 ilo = ivec3(lo + 0.5), ihi = ivec3(hi + 0.5) - 1;
  ivec3 cell = clamp(ivec3(floor(ro + rd * (t + 1e-3))), ilo, ihi);
  ivec3 stp = ivec3(sign(rd));
  vec3 tDelta = abs(inv);
  vec3 tMax = (vec3(cell) + max(vec3(stp), vec3(0.0)) - ro) * inv;
  int axis = tmn.x >= tmn.y && tmn.x >= tmn.z ? 0 : (tmn.y >= tmn.z ? 1 : 2);
  int want = int(v_lo.w + 0.5);
  int prev = -1;
  bool found = false;
  vec2 hit = vec2(0.0);
  for (int i = 0; i < 640; i++) {
    vec2 v = texelFetch(u_vox, cell, 0).rg;
    int lab = int(v.g * 255.0 + 0.5);
    if (lab != 0 && (want == 0 || lab == want)) { hit = v; found = true; break; }
    prev = lab;
    if (tMax.x < tMax.y && tMax.x < tMax.z) { t = tMax.x; tMax.x += tDelta.x; cell.x += stp.x; axis = 0; }
    else if (tMax.y < tMax.z) { t = tMax.y; tMax.y += tDelta.y; cell.y += stp.y; axis = 1; }
    else { t = tMax.z; tMax.z += tDelta.z; cell.z += stp.z; axis = 2; }
    if (t > tf || any(lessThan(cell, ilo)) || any(greaterThan(cell, ihi))) break;
  }
  if (!found) discard;
  float flags = v_misc.x;
  vec3 n = vec3(0.0);
  if (axis == 0) n.x = -float(stp.x); else if (axis == 1) n.y = -float(stp.y); else n.z = -float(stp.z);
  vec3 pv = ro + rd * t;
  vec4 hp = vec4(pv, 1.0);
  vec3 pw = vec3(dot(v_m0, hp), dot(v_m1, hp), dot(v_m2, hp));
  vec4 viewPos = u_view * vec4(pw.x, pw.z, -pw.y, 1.0);
  vec4 clip = u_proj * viewPos;
  gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
  if (bit(flags, 2.0)) {
    // Spectre fuzz: darkened, jittered copy of what's behind.
    float row = floor(gl_FragCoord.y / u_pixelScale);
    float off = hash(vec2(floor(gl_FragCoord.x / u_pixelScale), row + u_fuzzPhase)) > 0.5 ? 1.0 : -1.0;
    ivec2 sp = ivec2(gl_FragCoord.xy + vec2(0.0, off * u_pixelScale));
    float base = floor(texelFetch(u_scene, sp, 0).r * 255.0 + 0.5);
    o_color = vec4(shade(base, 6.0), 0.0, 0.0, 1.0);
    return;
  }
  float idx = floor(hit.r * 255.0 + 0.5);
  // Torn faces: next to a severed part, or (for chunks) a cut through the box.
  bool torn = false;
  if (prev > 0 && prev != want) {
    int mask = int(v_misc.y + 0.5);
    torn = ((mask >> (prev - 1)) & 1) == 1;
  } else if (prev < 0 && bit(flags, 4.0) && tn > 0.0) {
    ivec3 outside = cell;
    if (axis == 0) outside.x -= stp.x; else if (axis == 1) outside.y -= stp.y; else outside.z -= stp.z;
    torn = texelFetch(u_vox, outside, 0).g > 0.0;
  }
  if (torn) {
    float hsh = hash(vec2(float(cell.x * 7 + cell.z), float(cell.y * 13 - cell.z)));
    idx = v_misc.w + floor(hsh * 4.0);
  }
  // Faces lit like DOOM walls: a step brighter facing up or east-west,
  // darker facing down or north-south.
  vec3 nw = vec3(dot(v_m0.xyz, n), dot(v_m1.xyz, n), dot(v_m2.xyz, n));
  nw /= max(length(nw), 1e-6);
  float contrast = nw.z > 0.6 ? 1.0 : (nw.z < -0.6 ? -1.0 : (abs(nw.x) > abs(nw.y) ? 0.5 : -0.5));
  float level = lightLevel(v_hi.w, -viewPos.z, contrast, false, pw, bit(flags, 1.0));
  o_color = vec4(shade(idx, level), 0.0, 0.0, 1.0);
}
`;
