import * as THREE from 'three';
import type { SurfaceRecipe } from '../render/TextureBaker';

// Procedural food textures (colors authored in sRGB).

const v3 = (hex: number) => {
  const c = new THREE.Color(hex).convertLinearToSRGB();
  return new THREE.Vector3(c.r, c.g, c.b);
};

/** Bun crust mapped on a lathe: v = 0 at the cut rim, v = 1 at the crown top. */
export function bunCrust(name: string, top: number, mid: number, rim: number, opts: { mottle?: number; slash?: boolean } = {}): SurfaceRecipe {
  return {
    name: 'bunCrust_' + name,
    size: 512,
    repeat: false,
    normalStrength: 2.5,
    uniforms: { uTop: { value: v3(top) }, uMid: { value: v3(mid) }, uRim: { value: v3(rim) }, uMottle: { value: opts.mottle ?? 1 }, uSlash: { value: opts.slash ? 1 : 0 } },
    glsl: /* glsl */ `
    uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uRim; uniform float uMottle; uniform float uSlash;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      // u wraps around the bun (periodic), v climbs from rim to crown
      vec2 p = vec2(uv.x * 8.0, uv.y * 3.0);
      float n = pfbm(p, vec2(8.0, 4096.0), 5) * 0.5 + 0.5;
      float n2 = pfbm(vec2(uv.x * 40.0, uv.y * 14.0), vec2(40.0, 4096.0), 3) * 0.5 + 0.5;
      float band = smoothstep(0.02, 0.28, uv.y);
      vec3 c = mix(uRim, uMid, band);
      c = mix(c, uTop, smoothstep(0.35, 0.95, uv.y + (n - 0.5) * 0.35 * uMottle));
      c *= 0.9 + n * 0.18;
      // flour-dusty pale streak right at the rim ("oven spring" line)
      float spring = smoothstep(0.1, 0.02, abs(uv.y - 0.1 - (n - 0.5) * 0.08));
      c = mix(c, uRim * 1.08, spring * 0.5);
      // pretzel slash
      float slash = 0.0;
      if (uSlash > 0.5) {
        float a = abs(fract(uv.x * 2.0) - 0.5);
        slash = smoothstep(0.035, 0.0, a) * smoothstep(0.55, 0.8, uv.y);
        c = mix(c, uRim * 1.1, slash * 0.8);
      }
      color = c;
      height = n * 0.35 + n2 * 0.12 - slash * 0.4;
      rough = 0.42 + n2 * 0.12;
      metal = 0.0;
      ao = 1.0 - slash * 0.3;
    }`,
  };
}

/** Cut face of a bun (planar UV on a disc). */
export function bunCrumb(name: string, crumb: number, toast: number): SurfaceRecipe {
  return {
    name: 'bunCrumb_' + name,
    size: 512,
    repeat: false,
    normalStrength: 4.0,
    uniforms: { uCrumb: { value: v3(crumb) }, uToast: { value: v3(toast) } },
    glsl: /* glsl */ `
    uniform vec3 uCrumb; uniform vec3 uToast;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      vec2 q = uv - 0.5;
      float r = length(q) * 2.0;
      vec3 v = pvoronoi(uv * 26.0, vec2(4096.0), 0.9);
      float pores = smoothstep(0.0, 0.32, v.x);
      vec3 v2 = pvoronoi(uv * 60.0, vec2(4096.0), 1.0);
      float fine = smoothstep(0.0, 0.3, v2.x);
      float n = fbm2(uv * 9.0, 4) * 0.5 + 0.5;
      float toast = smoothstep(0.95, 0.35, r) * (0.55 + n * 0.45);
      vec3 c = mix(uCrumb, uToast, toast * 0.85);
      c *= 0.8 + pores * 0.2;
      // crust ring at the very edge
      float ring = smoothstep(0.86, 0.97, r);
      c = mix(c, uToast * 0.8, ring);
      color = c;
      height = pores * 0.5 + fine * 0.2;
      rough = 0.85;
      metal = 0.0;
      ao = 0.6 + pores * 0.4;
    }`,
  };
}

/** Ground meat surfaces (tileable). mode 0 = raw, 1 = cooked crust, 2 = charred. */
export function groundMeat(name: string, mode: 0 | 1 | 2, tint: { a: number; b: number; fat: number }): SurfaceRecipe {
  return {
    name: 'meat_' + name + mode,
    size: 512,
    repeat: true,
    normalStrength: mode === 0 ? 4.0 : 7.0,
    uniforms: { uA: { value: v3(tint.a) }, uB: { value: v3(tint.b) }, uFat: { value: v3(tint.fat) }, uMode: { value: mode } },
    glsl: /* glsl */ `
    uniform vec3 uA; uniform vec3 uB; uniform vec3 uFat; uniform float uMode;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      // rounded "crumbles" at two scales + irregular strands
      vec3 v1 = pvoronoi(uv * 16.0, vec2(16.0), 0.95);
      vec3 v2 = pvoronoi(uv * 9.0 + 5.0, vec2(9.0), 0.95);
      vec3 v3c = pvoronoi(uv * 34.0 + 11.0, vec2(34.0), 1.0);
      float b1 = 1.0 - smoothstep(0.0, 0.62, v1.x);
      float b2 = 1.0 - smoothstep(0.0, 0.7, v2.x);
      float b3 = 1.0 - smoothstep(0.0, 0.55, v3c.x);
      float n = pfbm(uv * 8.0, vec2(8.0), 4) * 0.5 + 0.5;
      float strands = pfbm(vec2(uv.x * 24.0 + n * 2.0, uv.y * 24.0), vec2(24.0), 3) * 0.5 + 0.5;
      float bump = max(max(b1 * (0.75 + v1.z * 0.25), b2 * 0.8), b3 * 0.55) * (0.8 + strands * 0.35);
      float crevice = 1.0 - smoothstep(0.08, 0.5, bump);
      float fat = step(0.82, v3c.z) * b3;
      if (uMode < 0.5) {
        vec3 c = mix(uA, uB, clamp(bump * 0.8 + n * 0.3, 0.0, 1.0));
        c = mix(c, uA * 0.55, crevice * 0.6);
        c = mix(c, uFat, fat * 0.8);
        color = c;
        rough = 0.32 + crevice * 0.2;
      } else if (uMode < 1.5) {
        vec3 dark = uA * 0.42;
        vec3 c = mix(dark, uB, smoothstep(0.1, 0.85, bump));
        c = mix(c, uB * 1.18 + vec3(0.03, 0.015, 0.0), smoothstep(0.75, 1.0, bump) * 0.6);
        c = mix(c, uFat, fat * 0.3);
        c *= 0.85 + n * 0.25;
        color = c;
        rough = 0.5 + crevice * 0.3;
      } else {
        vec3 c = mix(vec3(0.05, 0.035, 0.03), vec3(0.16, 0.1, 0.07), bump * (0.5 + v1.z * 0.5));
        float ash = step(0.88, v3c.z) * b3;
        c = mix(c, vec3(0.42, 0.4, 0.38), ash * 0.5);
        color = c;
        rough = 0.88;
      }
      height = bump * 0.6 + strands * 0.12 + n * 0.1;
      metal = 0.0;
      ao = 0.5 + (1.0 - crevice) * 0.5;
    }`,
  };
}

/** Breaded coating (chicken, onion rings). */
export function breaded(name: string, a: number, b: number): SurfaceRecipe {
  return {
    name: 'breaded_' + name,
    size: 512,
    repeat: true,
    normalStrength: 7.0,
    uniforms: { uA: { value: v3(a) }, uB: { value: v3(b) } },
    glsl: /* glsl */ `
    uniform vec3 uA; uniform vec3 uB;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      vec3 v = pvoronoi(uv * 30.0, vec2(30.0), 1.0);
      vec3 v2 = pvoronoi(uv * 80.0, vec2(80.0), 1.0);
      float n = pfbm(uv * 8.0, vec2(8.0), 4) * 0.5 + 0.5;
      float crumbs = smoothstep(0.5, 0.0, v.x) * 0.7 + smoothstep(0.4, 0.0, v2.x) * 0.3;
      vec3 c = mix(uA, uB, v.z * 0.6 + n * 0.5);
      c = mix(c * 0.7, c * 1.12, crumbs);
      color = c;
      height = crumbs * 0.8 + n * 0.2;
      rough = 0.55 + (1.0 - crumbs) * 0.2;
      metal = 0.0;
      ao = 0.6 + crumbs * 0.4;
    }`,
  };
}

export const veggieMash: SurfaceRecipe = {
  name: 'veggieMash',
  size: 512,
  repeat: true,
  normalStrength: 5.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec3 v = pvoronoi(uv * 18.0, vec2(18.0), 1.0);
    vec3 v2 = pvoronoi(uv * 40.0 + 7.0, vec2(40.0), 1.0);
    float n = pfbm(uv * 7.0, vec2(7.0), 4) * 0.5 + 0.5;
    vec3 c = mix(vec3(0.42, 0.45, 0.22), vec3(0.55, 0.5, 0.28), n);
    float pea = step(0.86, v.z) * smoothstep(0.32, 0.18, v.x);
    float corn = step(0.9, v2.z) * smoothstep(0.3, 0.15, v2.x);
    float bean = step(0.78, v2.z) * step(v2.z, 0.84) * smoothstep(0.3, 0.2, v2.x);
    c = mix(c, vec3(0.45, 0.7, 0.2), pea);
    c = mix(c, vec3(0.98, 0.8, 0.25), corn);
    c = mix(c, vec3(0.4, 0.12, 0.1), bean);
    color = c;
    height = smoothstep(0.0, 0.4, v.x) * 0.4 + pea * 0.3 + corn * 0.3;
    rough = 0.6;
    metal = 0.0;
    ao = 0.7 + v.x * 0.3;
  }`,
};

/** Lettuce leaf (planar UV centered at 0.5). */
export const lettuceLeaf: SurfaceRecipe = {
  name: 'lettuceLeaf',
  size: 512,
  repeat: false,
  normalStrength: 5.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 q = uv - 0.5;
    float r = length(q) * 2.0;
    float a = atan(q.y, q.x);
    // radial veins branching from centre
    float veins = 0.0;
    float k = 7.0;
    float av = abs(fract(a / 6.28318 * k + fbm2(vec2(r * 2.0, a), 3) * 0.15) - 0.5) * 2.0;
    veins = smoothstep(0.08, 0.0, av * r) * smoothstep(0.05, 0.3, r);
    // secondary veins
    float av2 = abs(fract(a / 6.28318 * k * 3.0 + r * 1.5) - 0.5) * 2.0;
    float veins2 = smoothstep(0.06, 0.0, av2 * r) * 0.5 * smoothstep(0.2, 0.6, r);
    float n = fbm2(uv * 12.0, 4) * 0.5 + 0.5;
    vec3 inner = vec3(0.82, 0.9, 0.52);
    vec3 mid = vec3(0.42, 0.74, 0.22);
    vec3 outer = vec3(0.3, 0.62, 0.16);
    vec3 c = mix(inner, mid, smoothstep(0.05, 0.55, r));
    c = mix(c, outer, smoothstep(0.55, 1.0, r));
    c *= 0.9 + n * 0.2;
    c = mix(c, vec3(0.88, 0.95, 0.66), (veins + veins2) * 0.6);
    color = c;
    height = n * 0.2 + veins * 0.45 + veins2 * 0.2 + sin(r * 60.0) * 0.03;
    rough = 0.45 + n * 0.1;
    metal = 0.0;
    ao = 0.85 + veins * 0.15;
  }`,
};

/** Tomato slice cut face (planar UV). */
export const tomatoSlice: SurfaceRecipe = {
  name: 'tomatoSlice',
  size: 512,
  repeat: false,
  normalStrength: 3.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 q = uv - 0.5;
    float r = length(q) * 2.0;
    float a = atan(q.y, q.x);
    float n = fbm2(uv * 10.0, 3) * 0.5 + 0.5;
    vec3 skin = vec3(0.72, 0.1, 0.06);
    vec3 flesh = vec3(0.93, 0.23, 0.14);
    vec3 gel = vec3(0.98, 0.52, 0.32);
    float lobes = 5.0;
    float la = fract((a / 6.28318) * lobes + 0.1) - 0.5;
    // locule chambers: ellipses between the radial walls
    float chamber = smoothstep(0.24, 0.16, abs(la)) * smoothstep(0.28, 0.38, r) * smoothstep(0.84, 0.7, r);
    float core = smoothstep(0.26, 0.15, r);
    vec3 c = flesh * (0.9 + n * 0.15);
    c = mix(c, gel, chamber * 0.9);
    c = mix(c, vec3(0.95, 0.35, 0.22), core * 0.7);
    // seeds inside chambers
    float sd = 0.0;
    for (int i = 0; i < 3; i++) {
      float rr = 0.45 + float(i) * 0.12;
      float s = fract((a / 6.28318) * lobes * 2.0 + float(i) * 0.37) - 0.5;
      sd += smoothstep(0.045, 0.02, length(vec2(s * rr * 1.1, r - rr) * vec2(1.0, 1.6)));
    }
    c = mix(c, vec3(0.98, 0.86, 0.55), clamp(sd, 0.0, 1.0) * chamber);
    float ring = smoothstep(0.88, 0.95, r);
    c = mix(c, skin, ring);
    color = c;
    height = chamber * -0.3 + sd * 0.3 * chamber + n * 0.1;
    rough = 0.2 + (1.0 - chamber) * 0.15;
    metal = 0.0;
    ao = 1.0 - chamber * 0.2;
  }`,
};

export const pickleSlice: SurfaceRecipe = {
  name: 'pickleSlice',
  size: 256,
  repeat: false,
  normalStrength: 3.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 q = uv - 0.5;
    float r = length(q) * 2.0;
    float a = atan(q.y, q.x);
    float n = fbm2(uv * 14.0, 3) * 0.5 + 0.5;
    vec3 c = mix(vec3(0.7, 0.76, 0.35), vec3(0.55, 0.62, 0.22), n);
    // seed ring
    float seedsA = fract(a / 6.28318 * 9.0) - 0.5;
    float seeds = smoothstep(0.1, 0.04, length(vec2(seedsA * 0.9, (r - 0.35) * 2.0)));
    c = mix(c, vec3(0.88, 0.86, 0.6), seeds * 0.8);
    c = mix(c, vec3(0.83, 0.85, 0.55), smoothstep(0.3, 0.0, r) * 0.6);
    float skin = smoothstep(0.82, 0.92, r);
    c = mix(c, vec3(0.2, 0.34, 0.1), skin);
    color = c;
    height = seeds * 0.3 + n * 0.1 + sin(a * 16.0) * 0.1 * skin;
    rough = 0.25;
    metal = 0.0;
    ao = 1.0;
  }`,
};

export const baconStrip: SurfaceRecipe = {
  name: 'baconStrip',
  size: 512,
  repeat: false,
  normalStrength: 5.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    // u along length, v across width
    float w = uv.y;
    float n = fbm2(vec2(uv.x * 6.0, uv.y * 3.0), 4) * 0.5 + 0.5;
    float wav = sin(uv.x * 20.0 + n * 3.0) * 0.06;
    float fat1 = smoothstep(0.1, 0.02, abs(w - 0.25 - wav));
    float fat2 = smoothstep(0.12, 0.03, abs(w - 0.68 + wav * 0.7));
    float fat = max(fat1, fat2 * 0.9);
    vec3 meat = mix(vec3(0.55, 0.14, 0.09), vec3(0.72, 0.24, 0.14), n);
    vec3 fatc = vec3(0.95, 0.78, 0.6);
    vec3 c = mix(meat, fatc, fat);
    // crispy browned spots
    float crisp = smoothstep(0.55, 0.85, fbm2(uv * vec2(18.0, 6.0) + 3.0, 4) * 0.5 + 0.5);
    c = mix(c, vec3(0.35, 0.12, 0.05), crisp * 0.6);
    float edge = smoothstep(0.12, 0.0, min(w, 1.0 - w));
    c = mix(c, vec3(0.3, 0.1, 0.05), edge * 0.6);
    color = c;
    height = n * 0.3 + crisp * 0.3 - fat * 0.1;
    rough = mix(0.35, 0.55, crisp);
    metal = 0.0;
    ao = 1.0 - edge * 0.2;
  }`,
};

export const eggWhite: SurfaceRecipe = {
  name: 'eggWhite',
  size: 512,
  repeat: false,
  normalStrength: 3.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 q = uv - 0.5;
    float r = length(q) * 2.0;
    float n = fbm2(uv * 9.0, 4) * 0.5 + 0.5;
    float lace = smoothstep(0.62, 0.95, r + (n - 0.5) * 0.4);
    vec3 c = vec3(0.98, 0.97, 0.94);
    c = mix(c, vec3(0.86, 0.6, 0.28), lace * 0.85);
    c = mix(c, vec3(0.55, 0.32, 0.12), smoothstep(0.85, 1.0, r + (n - 0.5) * 0.3) * 0.8);
    color = c;
    height = n * 0.4 + lace * 0.3;
    rough = mix(0.25, 0.6, lace);
    metal = 0.0;
    ao = 1.0;
  }`,
};

export const mushroomSlice: SurfaceRecipe = {
  name: 'mushroomSlice',
  size: 256,
  repeat: false,
  normalStrength: 3.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    float n = fbm2(uv * 10.0, 4) * 0.5 + 0.5;
    float gills = sin(uv.x * 90.0 + n * 4.0) * 0.5 + 0.5;
    vec3 c = mix(vec3(0.62, 0.45, 0.3), vec3(0.78, 0.6, 0.42), n);
    c = mix(c, c * 0.75, gills * smoothstep(0.55, 0.3, uv.y) * 0.5);
    c = mix(c, vec3(0.38, 0.24, 0.13), smoothstep(0.8, 1.0, uv.y) * 0.8);
    color = c;
    height = n * 0.3 + gills * 0.1;
    rough = 0.35;
    metal = 0.0;
    ao = 1.0;
  }`,
};
