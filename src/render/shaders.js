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
  float scale;
  if (isFlat) scale = min(80.0 / (floor(max(depth, 0.0) / 16.0) + 1.0), 24.0);
  else scale = min(1280.0 / max(depth, 1.0), 23.5);
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
  if (u_fixedColormap > 31.5) idx = shade(idx, u_fixedColormap) * 255.0;
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
