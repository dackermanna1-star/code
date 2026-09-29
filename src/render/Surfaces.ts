import * as THREE from 'three';
import type { SurfaceRecipe } from './TextureBaker';

// Procedural surface recipes for the restaurant environment.
// Every recipe implements `surface(uv, color, height, rough, metal, ao)`.
// Colors are authored in sRGB.

const v3 = (c: THREE.ColorRepresentation) => {
  const col = new THREE.Color(c);
  // THREE.Color stores linear internally when ColorManagement is on; get sRGB back.
  const s = col.clone().convertLinearToSRGB();
  return new THREE.Vector3(s.r, s.g, s.b);
};

export function checkerTile(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, name = 'checker'): SurfaceRecipe {
  return {
    name: `${name}_${new THREE.Color(a).getHexString()}_${new THREE.Color(b).getHexString()}`,
    size: 1024,
    repeat: true,
    normalStrength: 2.2,
    uniforms: { uA: { value: v3(a) }, uB: { value: v3(b) } },
    glsl: /* glsl */ `
    uniform vec3 uA; uniform vec3 uB;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      vec2 t = uv * 2.0;
      vec2 id = floor(t);
      vec2 f = fract(t);
      float checker = mod(id.x + id.y, 2.0);
      vec3 base = mix(uA, uB, checker);
      base *= 0.97 + hash12(id + 3.1) * 0.06;
      float g = 0.012;
      vec2 d = min(f, 1.0 - f);
      float edge = min(d.x, d.y);
      float grout = 1.0 - smoothstep(g * 0.5, g, edge);
      float bevel = smoothstep(g * 0.5, g * 3.0, edge);
      float n = pfbm(uv * 6.0, vec2(6.0), 5) * 0.5 + 0.5;
      float n2 = pfbm(uv * 48.0, vec2(48.0), 3) * 0.5 + 0.5;
      // scratches: stretched ridges in two directions
      float s1 = pridge(vec2(uv.x * 3.0 + uv.y * 3.0, uv.y * 90.0), vec2(3.0, 90.0), 2);
      float s2 = pridge(vec2(uv.x * 80.0, uv.y * 4.0 - uv.x * 4.0), vec2(80.0, 4.0), 2);
      float scratch = smoothstep(0.93, 0.99, max(s1, s2)) * 0.35;
      float dirt = smoothstep(0.45, 0.8, n) * 0.22;
      base = mix(base, base * vec3(0.86, 0.83, 0.78), dirt);
      base = mix(base, base * 1.12 + 0.02, scratch * (1.0 - checker * 0.5));
      vec3 groutCol = vec3(0.36, 0.34, 0.31) * (0.75 + 0.35 * n2);
      color = mix(base, groutCol, grout);
      height = bevel * 0.35 + (n2 - 0.5) * 0.01 - scratch * 0.02;
      rough = mix(mix(0.16, 0.42, dirt * 3.0 + n2 * 0.25) + scratch * 0.3, 0.92, grout);
      metal = 0.0;
      ao = mix(1.0, 0.55, grout) * (1.0 - dirt * 0.4);
    }`,
  };
}

export const quarryTile: SurfaceRecipe = {
  name: 'quarryTile',
  size: 1024,
  repeat: true,
  normalStrength: 3.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 t = uv * 3.0;
    vec2 id = floor(t);
    vec2 f = fract(t);
    float g = 0.03;
    vec2 d = min(f, 1.0 - f);
    float edge = min(d.x, d.y);
    float grout = 1.0 - smoothstep(g * 0.55, g, edge);
    float bevel = smoothstep(g * 0.5, g * 2.5, edge);
    float hv = hash12(id + 11.0);
    vec3 base = mix(vec3(0.55, 0.22, 0.14), vec3(0.66, 0.30, 0.18), hv);
    float n = pfbm(uv * 12.0, vec2(12.0), 5) * 0.5 + 0.5;
    float speck = step(0.82, hash12(mod(floor(uv * 700.0), 700.0)));
    float grit = pfbm(uv * 180.0, vec2(180.0), 2) * 0.5 + 0.5;
    base *= 0.82 + n * 0.3;
    base = mix(base, vec3(0.2, 0.12, 0.09), speck * 0.4);
    float grease = smoothstep(0.55, 0.85, pfbm(uv * 3.0 + 7.0, vec2(3.0), 4) * 0.5 + 0.5);
    base = mix(base, base * 0.7, grease * 0.5);
    vec3 groutCol = vec3(0.23, 0.2, 0.18) * (0.8 + 0.4 * grit);
    color = mix(base, groutCol, grout);
    height = bevel * 0.4 + grit * 0.06 + speck * 0.03;
    rough = mix(mix(0.72, 0.4, grease), 0.95, grout);
    metal = 0.0;
    ao = mix(1.0, 0.5, grout);
  }`,
};

export function subwayTile(grease = 0): SurfaceRecipe {
  return {
    name: 'subway_' + grease.toFixed(2),
    size: 1024,
    repeat: true,
    normalStrength: 2.6,
    uniforms: { uGrease: { value: grease } },
    glsl: /* glsl */ `
    uniform float uGrease;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      vec2 t = vec2(uv.x * 4.0, uv.y * 8.0);
      float row = floor(t.y);
      t.x += mod(row, 2.0) * 0.5;
      vec2 id = floor(t);
      vec2 f = fract(t);
      vec2 fs = vec2(f.x * 2.0, f.y); // aspect-correct distance (tile is 2:1)
      float g = 0.035;
      vec2 d = vec2(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y));
      float edge = min(d.x, d.y);
      float grout = 1.0 - smoothstep(g * 0.5, g, edge);
      // pillowed glaze
      float pillow = smoothstep(0.0, 0.22, edge);
      float hv = hash12(mod(id, vec2(4.0, 8.0)) + 5.0);
      vec3 base = vec3(0.93, 0.92, 0.88) * (0.97 + hv * 0.05);
      float n = pfbm(uv * 5.0, vec2(5.0), 4) * 0.5 + 0.5;
      float streak = pfbm(vec2(uv.x * 16.0, uv.y * 2.0), vec2(16.0, 2.0), 4) * 0.5 + 0.5;
      float gr = uGrease * smoothstep(0.35, 0.8, n * 0.6 + streak * 0.6 - uv.y * 0.3);
      base = mix(base, vec3(0.72, 0.6, 0.42), gr * 0.55);
      vec3 groutCol = mix(vec3(0.62, 0.6, 0.56), vec3(0.3, 0.26, 0.2), uGrease * 0.8) * (0.85 + n * 0.2);
      color = mix(base, groutCol, grout);
      height = pillow * 0.4 - grout * 0.1;
      rough = mix(mix(0.08, 0.35, gr), 0.9, grout);
      metal = 0.0;
      ao = mix(1.0, 0.6, grout);
    }`,
  };
}

export const brick: SurfaceRecipe = {
  name: 'brick',
  size: 1024,
  repeat: true,
  normalStrength: 4.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 t = vec2(uv.x * 4.0, uv.y * 12.0);
    float row = floor(t.y);
    t.x += mod(row, 2.0) * 0.5;
    vec2 id = floor(t);
    vec2 f = fract(t);
    vec2 d = vec2(min(f.x, 1.0 - f.x) * 3.0, min(f.y, 1.0 - f.y));
    float n = pfbm(uv * 20.0, vec2(20.0), 5) * 0.5 + 0.5;
    float chip = pfbm(uv * 60.0, vec2(60.0), 3) * 0.5 + 0.5;
    float edge = min(d.x, d.y) + (chip - 0.5) * 0.08;
    float mortar = 1.0 - smoothstep(0.05, 0.1, edge);
    float hv = hash12(mod(id, vec2(4.0, 12.0)) + 1.7);
    vec3 red = mix(vec3(0.55, 0.22, 0.15), vec3(0.68, 0.33, 0.22), hv);
    red = mix(red, vec3(0.36, 0.16, 0.12), step(0.86, hv) * 0.8);
    red = mix(red, vec3(0.74, 0.5, 0.36), step(hv, 0.08) * 0.6);
    red *= 0.78 + n * 0.35;
    vec3 mort = vec3(0.72, 0.68, 0.6) * (0.8 + chip * 0.3);
    color = mix(red, mort, mortar);
    height = (1.0 - mortar) * (0.5 + chip * 0.15) + n * 0.06;
    rough = mix(0.82, 0.95, mortar);
    metal = 0.0;
    ao = mix(1.0, 0.45, mortar);
  }`,
};

export function woodPlanks(tone: THREE.ColorRepresentation = 0x9c6b43, planks = 5, name = 'planks'): SurfaceRecipe {
  return {
    name: `${name}_${new THREE.Color(tone).getHexString()}_${planks}`,
    size: 1024,
    repeat: true,
    normalStrength: 1.6,
    uniforms: { uTone: { value: v3(tone) }, uPlanks: { value: planks } },
    glsl: /* glsl */ `
    uniform vec3 uTone; uniform float uPlanks;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      float pv = uv.y * uPlanks;
      float plank = floor(pv);
      float fv = fract(pv);
      // staggered butt joints
      float off = hash12(vec2(plank, 3.0));
      float pu = uv.x * 2.0 + off;
      float seg = floor(pu);
      float fu = fract(pu);
      float pid = hash12(vec2(plank, mod(seg, 2.0)) + 9.0);
      vec2 grainP = vec2(uv.x * 3.0, uv.y * uPlanks * 1.0);
      float warp = pfbm(vec2(uv.x * 2.0, uv.y * uPlanks), vec2(2.0, uPlanks), 3);
      float grain = pfbm(vec2(uv.x * 4.0 + warp * 0.3, (uv.y + warp * 0.02) * uPlanks * 14.0 + pid * 13.0), vec2(4.0, uPlanks * 14.0), 5);
      float rings = sin((grain * 6.0 + pid * 20.0) * 3.14159) * 0.5 + 0.5;
      vec3 base = uTone * (0.78 + pid * 0.35);
      base = mix(base, base * 0.72, rings * 0.45);
      float fine = pfbm(vec2(uv.x * 64.0, uv.y * uPlanks * 64.0), vec2(64.0, uPlanks * 64.0), 2) * 0.5 + 0.5;
      base *= 0.92 + fine * 0.12;
      float seamV = 1.0 - smoothstep(0.0, 0.018, min(fv, 1.0 - fv));
      float seamU = 1.0 - smoothstep(0.0, 0.004, min(fu, 1.0 - fu) / 2.0);
      float seam = max(seamV, seamU);
      color = mix(base, base * 0.35, seam);
      height = (1.0 - seam) * 0.3 + rings * 0.04 + fine * 0.02;
      rough = mix(0.38 + rings * 0.12 + fine * 0.08, 0.85, seam);
      metal = 0.0;
      ao = mix(1.0, 0.5, seam);
    }`,
  };
}

export const butcherBlock: SurfaceRecipe = {
  name: 'butcherBlock',
  size: 1024,
  repeat: true,
  normalStrength: 1.2,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    float strips = 14.0;
    float s = floor(uv.y * strips);
    float fs = fract(uv.y * strips);
    float sid = hash12(vec2(s, 1.0));
    vec3 light = vec3(0.78, 0.58, 0.38);
    vec3 dark = vec3(0.55, 0.36, 0.2);
    vec3 base = mix(dark, light, sid);
    float grain = pfbm(vec2(uv.x * 3.0, uv.y * strips * 10.0 + sid * 30.0), vec2(3.0, strips * 10.0), 5) * 0.5 + 0.5;
    base *= 0.8 + grain * 0.35;
    float knife = pridge(vec2(uv.x * 6.0 + uv.y * 6.0, uv.y * 140.0), vec2(6.0, 140.0), 2);
    float cuts = smoothstep(0.92, 0.99, knife);
    base = mix(base, base * 0.75, cuts * 0.5);
    float seam = 1.0 - smoothstep(0.0, 0.03, min(fs, 1.0 - fs));
    color = mix(base, base * 0.6, seam * 0.6);
    height = grain * 0.05 - cuts * 0.05 - seam * 0.04;
    rough = 0.55 + grain * 0.15 + cuts * 0.1;
    metal = 0.0;
    ao = 1.0 - seam * 0.3;
  }`,
};

export function brushedSteel(tint = 1.0, name = 'steel'): SurfaceRecipe {
  return {
    name: `${name}_${tint.toFixed(2)}`,
    size: 1024,
    repeat: true,
    normalStrength: 0.6,
    uniforms: { uTint: { value: tint } },
    glsl: /* glsl */ `
    uniform float uTint;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      float streak = pfbm(vec2(uv.x * 2.0, uv.y * 320.0), vec2(2.0, 320.0), 4) * 0.5 + 0.5;
      float streak2 = pfbm(vec2(uv.x * 1.0, uv.y * 900.0), vec2(1.0, 900.0), 2) * 0.5 + 0.5;
      float smudge = pfbm(uv * 3.0, vec2(3.0), 5) * 0.5 + 0.5;
      float prints = smoothstep(0.62, 0.8, pfbm(uv * 9.0 + 4.0, vec2(9.0), 4) * 0.5 + 0.5);
      float s1 = pridge(vec2(uv.x * 20.0 + uv.y * 20.0, uv.y * 8.0 - uv.x * 32.0), vec2(20.0, 8.0), 3);
      float s2 = pridge(vec2(uv.x * 7.0 - uv.y * 28.0, uv.y * 4.0 + uv.x * 60.0), vec2(7.0, 4.0), 3);
      float scratch = smoothstep(0.955, 0.995, max(s1, s2));
      vec3 base = vec3(0.8, 0.81, 0.83) * uTint;
      base *= 0.9 + streak * 0.12 + streak2 * 0.05;
      base = mix(base, base * 0.85, prints * 0.4);
      color = base + scratch * 0.08;
      height = streak * 0.02 + streak2 * 0.01 - scratch * 0.05;
      rough = 0.22 + streak * 0.1 + smudge * 0.12 + prints * 0.18 + scratch * 0.15;
      metal = 1.0;
      ao = 1.0;
    }`,
  };
}

export const castIron: SurfaceRecipe = {
  name: 'castIron',
  size: 512,
  repeat: true,
  normalStrength: 3.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    float n = pfbm(uv * 16.0, vec2(16.0), 5) * 0.5 + 0.5;
    float pits = pvoronoi(uv * 40.0, vec2(40.0), 1.0).x;
    float grease = smoothstep(0.45, 0.75, pfbm(uv * 4.0, vec2(4.0), 4) * 0.5 + 0.5);
    vec3 base = mix(vec3(0.12, 0.11, 0.1), vec3(0.2, 0.18, 0.16), n);
    base = mix(base, vec3(0.08, 0.06, 0.04), grease * 0.6);
    color = base;
    height = n * 0.2 + smoothstep(0.0, 0.3, pits) * 0.1;
    rough = mix(0.72, 0.3, grease);
    metal = 0.55;
    ao = 1.0;
  }`,
};

export function laminate(bg: THREE.ColorRepresentation = 0xf1e6cf, name = 'laminate'): SurfaceRecipe {
  return {
    name: `${name}_${new THREE.Color(bg).getHexString()}`,
    size: 1024,
    repeat: true,
    normalStrength: 0.4,
    uniforms: { uBg: { value: v3(bg) } },
    glsl: /* glsl */ `
    uniform vec3 uBg;
    float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      vec2 grid = vec2(7.0);
      vec2 p = uv * grid;
      vec3 col = uBg;
      float shape = 0.0;
      vec3 shapeCol = vec3(0.0);
      for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++){
        vec2 cell = floor(p) + vec2(float(x), float(y));
        vec2 wc = mod(cell, grid);
        vec3 h = hash32(wc + 0.5);
        vec2 c = cell + 0.25 + h.xy * 0.5;
        float a = h.z * 6.2831;
        vec2 q = p - c;
        q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
        float d = min(sdSeg(q, vec2(0.0), vec2(0.28, 0.12)), sdSeg(q, vec2(0.0), vec2(0.28, -0.12)));
        float m = 1.0 - smoothstep(0.035, 0.045, d);
        float pickc = hash12(wc + 7.7);
        vec3 c3 = pickc < 0.33 ? vec3(0.36, 0.72, 0.72) : (pickc < 0.66 ? vec3(0.93, 0.47, 0.44) : vec3(0.25, 0.26, 0.3));
        if (m > shape) { shape = m; shapeCol = c3; }
      }
      col = mix(col, shapeCol, shape);
      float fleck = step(0.985, hash12(mod(floor(uv * 400.0), 400.0)));
      col = mix(col, vec3(0.85, 0.7, 0.35), fleck);
      float n = pfbm(uv * 30.0, vec2(30.0), 3) * 0.5 + 0.5;
      color = col * (0.97 + n * 0.05);
      height = n * 0.02;
      rough = 0.25 + n * 0.1 - fleck * 0.1;
      metal = fleck * 0.8;
      ao = 1.0;
    }`,
  };
}

export function plaster(tone: THREE.ColorRepresentation, name = 'plaster'): SurfaceRecipe {
  return {
    name: `${name}_${new THREE.Color(tone).getHexString()}`,
    size: 512,
    repeat: true,
    normalStrength: 1.0,
    uniforms: { uTone: { value: v3(tone) } },
    glsl: /* glsl */ `
    uniform vec3 uTone;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      float n = pfbm(uv * 8.0, vec2(8.0), 5) * 0.5 + 0.5;
      float stipple = pfbm(uv * 90.0, vec2(90.0), 3) * 0.5 + 0.5;
      color = uTone * (0.94 + n * 0.08 + stipple * 0.04);
      height = stipple * 0.12 + n * 0.05;
      rough = 0.82 + stipple * 0.1;
      metal = 0.0;
      ao = 1.0;
    }`,
  };
}

export function vinyl(tone: THREE.ColorRepresentation = 0xc0282d, channels = 5, name = 'vinyl'): SurfaceRecipe {
  return {
    name: `${name}_${new THREE.Color(tone).getHexString()}_${channels}`,
    size: 512,
    repeat: true,
    normalStrength: 6.0,
    uniforms: { uTone: { value: v3(tone) }, uCh: { value: channels } },
    glsl: /* glsl */ `
    uniform vec3 uTone; uniform float uCh;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      float c = fract(uv.x * uCh);
      float roll = sin(c * 3.14159);
      float seam = 1.0 - smoothstep(0.0, 0.05, min(c, 1.0 - c));
      float wr = pfbm(uv * vec2(4.0, 12.0), vec2(4.0, 12.0), 4) * 0.5 + 0.5;
      float grain = pfbm(uv * 120.0, vec2(120.0), 2) * 0.5 + 0.5;
      color = uTone * (0.7 + roll * 0.35) * (0.95 + grain * 0.08);
      color = mix(color, color * 0.45, seam);
      height = pow(roll, 0.6) * 0.8 + wr * 0.08 + grain * 0.01;
      rough = 0.32 + grain * 0.1 + wr * 0.1;
      metal = 0.0;
      ao = mix(1.0, 0.6, seam);
    }`,
  };
}

export const concrete: SurfaceRecipe = {
  name: 'concrete',
  size: 512,
  repeat: true,
  normalStrength: 2.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 f = fract(uv * 2.0);
    float joint = 1.0 - smoothstep(0.004, 0.012, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float n = pfbm(uv * 10.0, vec2(10.0), 5) * 0.5 + 0.5;
    float pores = smoothstep(0.08, 0.0, pvoronoi(uv * 90.0, vec2(90.0), 1.0).x);
    vec3 base = vec3(0.62, 0.61, 0.58) * (0.85 + n * 0.25);
    base = mix(base, base * 0.6, pores * 0.5);
    color = mix(base, base * 0.5, joint);
    height = n * 0.1 - pores * 0.1 - joint * 0.3;
    rough = 0.88;
    metal = 0.0;
    ao = mix(1.0, 0.6, joint);
  }`,
};

export const asphalt: SurfaceRecipe = {
  name: 'asphalt',
  size: 512,
  repeat: true,
  normalStrength: 2.5,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    float n = pfbm(uv * 6.0, vec2(6.0), 4) * 0.5 + 0.5;
    vec3 v = pvoronoi(uv * 140.0, vec2(140.0), 1.0);
    float stone = smoothstep(0.35, 0.05, v.x);
    vec3 base = vec3(0.16, 0.16, 0.17) * (0.8 + n * 0.3);
    base = mix(base, vec3(0.3 + v.z * 0.2), stone * 0.35);
    color = base;
    height = stone * 0.2 + n * 0.1;
    rough = 0.9 - stone * 0.1;
    metal = 0.0;
    ao = 1.0;
  }`,
};

export function awning(a: THREE.ColorRepresentation = 0xd22e2e, b: THREE.ColorRepresentation = 0xf6efe2): SurfaceRecipe {
  return {
    name: `awning_${new THREE.Color(a).getHexString()}`,
    size: 512,
    repeat: true,
    normalStrength: 1.2,
    uniforms: { uA: { value: v3(a) }, uB: { value: v3(b) } },
    glsl: /* glsl */ `
    uniform vec3 uA; uniform vec3 uB;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      float s = step(0.5, fract(uv.x * 4.0));
      vec2 w = fract(uv * 160.0);
      float weave = (sin(w.x * 6.283) * sin(w.y * 6.283)) * 0.5 + 0.5;
      float n = pfbm(uv * 6.0, vec2(6.0), 4) * 0.5 + 0.5;
      color = mix(uA, uB, s) * (0.9 + weave * 0.08 + n * 0.06);
      height = weave * 0.2;
      rough = 0.85;
      metal = 0.0;
      ao = 1.0;
    }`,
  };
}

export const cardboard: SurfaceRecipe = {
  name: 'cardboard',
  size: 512,
  repeat: true,
  normalStrength: 1.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    float n = pfbm(uv * 8.0, vec2(8.0), 5) * 0.5 + 0.5;
    float fib = pfbm(vec2(uv.x * 200.0, uv.y * 30.0), vec2(200.0, 30.0), 2) * 0.5 + 0.5;
    float corr = sin(uv.y * 6.283 * 60.0) * 0.5 + 0.5;
    color = vec3(0.66, 0.5, 0.32) * (0.85 + n * 0.25 + fib * 0.05);
    height = corr * 0.05 + fib * 0.03;
    rough = 0.9;
    metal = 0.0;
    ao = 1.0;
  }`,
};

export const chalkboard: SurfaceRecipe = {
  name: 'chalkboard',
  size: 512,
  repeat: false,
  normalStrength: 0.5,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    float n = pfbm(uv * 5.0, vec2(5.0), 5) * 0.5 + 0.5;
    float smear = smoothstep(0.5, 0.9, pfbm(vec2(uv.x * 3.0, uv.y * 9.0), vec2(3.0, 9.0), 4) * 0.5 + 0.5);
    color = vec3(0.12, 0.16, 0.14) + smear * 0.06 + n * 0.02;
    height = n * 0.05;
    rough = 0.9;
    metal = 0.0;
    ao = 1.0;
  }`,
};

export const fabricWeave: SurfaceRecipe = {
  name: 'fabricWeave',
  size: 256,
  repeat: true,
  normalStrength: 2.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 w = fract(uv * 48.0);
    float a = sin(w.x * 6.283) * 0.5 + 0.5;
    float b = sin(w.y * 6.283) * 0.5 + 0.5;
    float over = step(0.5, fract((floor(uv.x * 48.0) + floor(uv.y * 48.0)) * 0.5));
    float h = mix(a, b, over);
    float n = pfbm(uv * 8.0, vec2(8.0), 3) * 0.5 + 0.5;
    color = vec3(1.0) * (0.9 + h * 0.1) * (0.95 + n * 0.05);
    height = h * 0.4;
    rough = 0.9;
    metal = 0.0;
    ao = 0.9 + h * 0.1;
  }`,
};

export const paper: SurfaceRecipe = {
  name: 'paper',
  size: 256,
  repeat: true,
  normalStrength: 0.8,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    float n = pfbm(uv * 16.0, vec2(16.0), 4) * 0.5 + 0.5;
    float fib = pfbm(uv * 90.0, vec2(90.0), 2) * 0.5 + 0.5;
    color = vec3(0.86, 0.84, 0.79) * (0.96 + n * 0.04);
    height = fib * 0.1 + n * 0.05;
    rough = 0.92;
    metal = 0.0;
    ao = 1.0;
  }`,
};

export function beadboard(tone: THREE.ColorRepresentation, name = 'beadboard'): SurfaceRecipe {
  return {
    name: `${name}_${new THREE.Color(tone).getHexString()}`,
    size: 512,
    repeat: true,
    normalStrength: 3.0,
    uniforms: { uTone: { value: v3(tone) } },
    glsl: /* glsl */ `
    uniform vec3 uTone;
    void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
      float b = fract(uv.x * 8.0);
      float groove = 1.0 - smoothstep(0.0, 0.06, min(b, 1.0 - b));
      float bead = smoothstep(0.1, 0.0, abs(b - 0.5)) * 0.5;
      float n = pfbm(uv * vec2(8.0, 2.0), vec2(8.0, 2.0), 4) * 0.5 + 0.5;
      float brush = pfbm(vec2(uv.x * 40.0, uv.y * 400.0), vec2(40.0, 400.0), 2) * 0.5 + 0.5;
      vec3 c = uTone * (0.95 + n * 0.06 + brush * 0.03);
      color = mix(c, c * 0.55, groove);
      height = (1.0 - groove) * 0.5 + bead * 0.1 + brush * 0.01;
      rough = 0.45 + brush * 0.1 + groove * 0.3;
      metal = 0.0;
      ao = mix(1.0, 0.55, groove);
    }`,
  };
}

export const tinCeiling: SurfaceRecipe = {
  name: 'tinCeiling',
  size: 512,
  repeat: true,
  normalStrength: 5.0,
  glsl: /* glsl */ `
  void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao){
    vec2 f = fract(uv * 2.0) - 0.5;
    float border = smoothstep(0.46, 0.44, max(abs(f.x), abs(f.y)));
    float inner = smoothstep(0.36, 0.34, max(abs(f.x), abs(f.y)));
    float r = length(f);
    float boss = smoothstep(0.16, 0.12, r);
    float ring = smoothstep(0.03, 0.0, abs(r - 0.26));
    float petals = smoothstep(0.02, 0.0, abs(r - (0.2 + 0.05 * cos(atan(f.y, f.x) * 8.0))));
    float h = border * 0.3 + inner * 0.2 + boss * 0.3 + ring * 0.2 + petals * 0.15;
    float n = pfbm(uv * 6.0, vec2(6.0), 3) * 0.5 + 0.5;
    color = vec3(0.93, 0.9, 0.84) * (0.9 + n * 0.1);
    height = h;
    rough = 0.45;
    metal = 0.25;
    ao = 0.75 + h * 0.25;
  }`,
};
