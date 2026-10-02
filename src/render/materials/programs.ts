/**
 * Assembles the fragment shaders of the material programs. Each program is one GLSL "family"
 * file defining `Mat material(vec2 uv)` (dispatching on `uVariant`), plus the shared libraries it
 * needs. Variant ids are generated from the `V_<NAME>` tokens found in the family source, so the
 * TypeScript definitions refer to variants by name (`'stone'` -> `V_STONE`).
 */
import lib from './glsl/lib.glsl?raw';
import libStone from './glsl/lib_stone.glsl?raw';
import libWood from './glsl/lib_wood.glsl?raw';
import libMetal from './glsl/lib_metal.glsl?raw';
import libPlant from './glsl/lib_plant.glsl?raw';
import libSoil from './glsl/lib_soil.glsl?raw';
import famRock from './glsl/rock.glsl?raw';
import famOre from './glsl/ore.glsl?raw';
import famMasonry from './glsl/masonry.glsl?raw';
import famWood from './glsl/wood.glsl?raw';
import famWoodwork from './glsl/woodwork.glsl?raw';
import famSoil from './glsl/soil.glsl?raw';
import famFoliage from './glsl/foliage.glsl?raw';
import famPlants from './glsl/plants.glsl?raw';
import famFlowers from './glsl/flowers.glsl?raw';
import famMetal from './glsl/metal.glsl?raw';
import famGlass from './glsl/glass.glsl?raw';
import famCloth from './glsl/cloth.glsl?raw';
import famFluid from './glsl/fluid.glsl?raw';
import famOrganic from './glsl/organic.glsl?raw';
import famMachine from './glsl/machine.glsl?raw';
import famRedstone from './glsl/redstone.glsl?raw';

export type ProgramName =
  | 'rock' | 'ore' | 'masonry' | 'wood' | 'woodwork' | 'soil' | 'foliage' | 'plants' | 'flowers'
  | 'metal' | 'glass' | 'cloth' | 'fluid' | 'organic' | 'machine' | 'redstone';

const SOURCES: Record<ProgramName, string[]> = {
  rock: [libStone, famRock],
  ore: [libStone, famOre],
  masonry: [libStone, famMasonry],
  wood: [libWood, famWood],
  woodwork: [libWood, libMetal, famWoodwork],
  soil: [libStone, libSoil, libPlant, famSoil],
  foliage: [libPlant, famFoliage],
  plants: [libPlant, famPlants],
  flowers: [libPlant, famFlowers],
  metal: [libMetal, famMetal],
  glass: [famGlass],
  cloth: [famCloth],
  fluid: [famFluid],
  organic: [libPlant, famOrganic],
  machine: [libStone, libWood, libMetal, famMachine],
  redstone: [libStone, libWood, libMetal, famRedstone],
};

export const PROGRAM_NAMES = Object.keys(SOURCES) as ProgramName[];

export const HEADER = /* glsl */ `
precision highp float;
precision highp int;
uniform float uSize;
uniform float uSeed;
uniform int uSS;
uniform int uZero; // always 0: keeps loop bounds non-constant so compilers don't unroll (compile time)
uniform int uVariant;
uniform int uCutout;
uniform vec4 uP[4];
uniform vec3 uC[8];
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oSurf;
`;

const FOOTER = /* glsl */ `
void main() {
  int n = uSS;
  vec3 col = vec3(0.0), colW = vec3(0.0);
  float wsum = 0.0, a = 0.0, h = 0.0, r = 0.0;
  for (int y = 0; y < 4; y++) {
    if (y >= n) break;
    for (int x = 0; x < 4; x++) {
      if (x >= n) break;
      vec2 off = (vec2(float(x), float(y)) + 0.5) / float(n);
      vec2 uv = (floor(gl_FragCoord.xy) + off) / uSize;
      Mat m = material(uv);
      col += m.col;
      colW += m.col * m.a;
      wsum += m.a;
      a += m.a;
      h += m.h;
      r += m.r;
    }
  }
  float inv = 1.0 / float(n * n);
  vec3 c = (uCutout == 1 && wsum > 1e-4) ? colW / wsum : col * inv;
  oAlbedo = vec4(max(c, vec3(0.0)), clamp(a * inv, 0.0, 1.0));
  oSurf = vec4(clamp(h * inv, 0.0, 1.0), clamp(r * inv, 0.02, 1.0), 0.0, 1.0);
}
`;

export interface BuiltProgram {
  name: ProgramName;
  fragment: string;
  /** variant name (lower case, without V_) -> id */
  variants: Map<string, number>;
}

export function buildProgram(name: ProgramName): BuiltProgram {
  const parts = SOURCES[name];
  const fam = parts[parts.length - 1];
  const variants = new Map<string, number>();
  const re = /\bV_([A-Z0-9_]+)\b/g;
  let mm: RegExpExecArray | null;
  for (const src of parts) {
    while ((mm = re.exec(src))) {
      const key = mm[1].toLowerCase();
      if (!variants.has(key)) variants.set(key, variants.size);
    }
  }
  const defines = [...variants].map(([k, i]) => `#define V_${k.toUpperCase()} ${i}`).join('\n');
  const fragment = [HEADER, defines, lib, ...parts.slice(0, -1), fam, FOOTER].join('\n');
  return { name, fragment, variants };
}

export const VERTEX = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Pass 2a: alpha-aware colour dilation for cutout cards + sRGB encode. */
export const ALBEDO_FRAG = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tA;
uniform int uN;
uniform int uCutout;
uniform vec3 uBg;
out vec4 oColor;
vec3 lin2srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(tA, p, 0);
  vec3 rgb = c.rgb;
  if (uCutout == 1 && c.a < 0.6) {
    vec3 acc = vec3(0.0);
    float w = 0.0;
    for (int y = -4; y <= 4; y++) {
      for (int x = -4; x <= 4; x++) {
        ivec2 q = ((p + ivec2(x, y)) % uN + uN) % uN;
        vec4 s = texelFetch(tA, q, 0);
        float k = s.a * s.a / (1.0 + float(x * x + y * y));
        acc += s.rgb * k;
        w += k;
      }
    }
    vec3 fill = w > 1e-4 ? acc / w : uBg;
    float t = w > 1e-4 ? clamp(w * 2.0, 0.0, 1.0) : 0.0;
    fill = mix(uBg, fill, t);
    rgb = mix(fill, rgb, clamp(c.a / 0.6, 0.0, 1.0));
  }
  oColor = vec4(lin2srgb(clamp(rgb, 0.0, 1.0)), c.a);
}
`;

/** Pass 2b: tangent-space normal from the height field (Sobel, wrapped) + height + roughness. */
export const NORMAL_FRAG = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tS;
uniform sampler2D tA;
uniform int uN;
uniform int uCutout;
uniform float uDepth;
out vec4 oColor;
float hc;
float H(ivec2 p) {
  p = (p % uN + uN) % uN;
  float h = texelFetch(tS, p, 0).r;
  if (uCutout == 1 && texelFetch(tA, p, 0).a < 0.5) h = hc;
  return h;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(tS, p, 0);
  hc = s.r;
  float tl = H(p + ivec2(-1, 1)), t = H(p + ivec2(0, 1)), tr = H(p + ivec2(1, 1));
  float l = H(p + ivec2(-1, 0)), r = H(p + ivec2(1, 0));
  float bl = H(p + ivec2(-1, -1)), b = H(p + ivec2(0, -1)), br = H(p + ivec2(1, -1));
  float dx = ((tr + 2.0 * r + br) - (tl + 2.0 * l + bl)) * 0.125;
  float dy = ((tl + 2.0 * t + tr) - (bl + 2.0 * b + br)) * 0.125;
  float k = uDepth * float(uN);
  vec3 n = normalize(vec3(-dx * k, -dy * k, 1.0));
  oColor = vec4(n.xy * 0.5 + 0.5, s.r, s.g);
}
`;
