import * as THREE from 'three';
import { addWrapLighting } from '../character/materials.js';

/**
 * Procedural fabric material.  Patterns and weave micro-structure are computed
 * from the garment's *rest-pose* position (attribute `restPos`) with a
 * tri-planar projection, so they are seamless and stick to the cloth as it
 * deforms.  No textures need to be downloaded.
 */

export const MATERIALS = {
  cotton: { label: 'Cotton', roughness: 0.88, sheen: 0.25, sheenRoughness: 0.8, weave: 1, weaveScale: 900, bump: 0.35 },
  jersey: { label: 'Jersey knit', roughness: 0.82, sheen: 0.45, sheenRoughness: 0.7, weave: 2, weaveScale: 1100, bump: 0.3 },
  linen: { label: 'Linen', roughness: 0.92, sheen: 0.2, sheenRoughness: 0.9, weave: 1, weaveScale: 520, bump: 0.6, slub: 1 },
  denim: { label: 'Denim', roughness: 0.9, sheen: 0.2, sheenRoughness: 0.9, weave: 3, weaveScale: 700, bump: 0.7, denim: 1 },
  wool: { label: 'Wool knit', roughness: 0.96, sheen: 0.9, sheenRoughness: 0.6, weave: 4, weaveScale: 230, bump: 1.4, fuzz: 1 },
  cashmere: { label: 'Cashmere', roughness: 0.97, sheen: 1.0, sheenRoughness: 0.45, weave: 2, weaveScale: 520, bump: 0.5, fuzz: 1 },
  silk: { label: 'Silk satin', roughness: 0.28, sheen: 0.6, sheenRoughness: 0.25, weave: 0, weaveScale: 1, bump: 0, specular: 0.9 },
  chiffon: { label: 'Chiffon', roughness: 0.5, sheen: 0.5, sheenRoughness: 0.4, weave: 1, weaveScale: 1400, bump: 0.15 },
  leather: { label: 'Leather', roughness: 0.42, sheen: 0.1, sheenRoughness: 0.5, weave: 5, weaveScale: 160, bump: 0.5, clearcoat: 0.25 },
  suede: { label: 'Suede', roughness: 1.0, sheen: 0.8, sheenRoughness: 0.5, weave: 5, weaveScale: 400, bump: 0.15 },
  patent: { label: 'Patent leather', roughness: 0.18, sheen: 0, sheenRoughness: 0.5, weave: 0, weaveScale: 1, bump: 0, clearcoat: 1, specular: 1 },
  tweed: { label: 'Tweed', roughness: 0.95, sheen: 0.5, sheenRoughness: 0.7, weave: 3, weaveScale: 260, bump: 1.0, slub: 2 },
  nylon: { label: 'Nylon', roughness: 0.45, sheen: 0.6, sheenRoughness: 0.3, weave: 2, weaveScale: 2400, bump: 0.15 },
  microfiber: { label: 'Microfiber', roughness: 0.55, sheen: 0.4, sheenRoughness: 0.4, weave: 2, weaveScale: 2400, bump: 0.1 },
  lace: { label: 'Lace', roughness: 0.75, sheen: 0.4, sheenRoughness: 0.6, weave: 6, weaveScale: 140, bump: 0.4 },
  rubber: { label: 'Rubber', roughness: 0.75, sheen: 0, sheenRoughness: 1, weave: 0, weaveScale: 1, bump: 0 },
  metal: { label: 'Metal', roughness: 0.25, sheen: 0, sheenRoughness: 1, weave: 0, weaveScale: 1, bump: 0, metalness: 1 },
};

export const PATTERNS = {
  solid: { label: 'Solid', id: 0 },
  stripes: { label: 'Breton stripes', id: 1 },
  pinstripe: { label: 'Pinstripe', id: 2 },
  gingham: { label: 'Gingham', id: 3 },
  tartan: { label: 'Tartan', id: 4 },
  polka: { label: 'Polka dots', id: 5 },
  houndstooth: { label: 'Houndstooth', id: 6 },
  floral: { label: 'Floral', id: 7 },
  leopard: { label: 'Leopard', id: 8 },
  rib: { label: 'Ribbed', id: 9 },
  cable: { label: 'Cable knit', id: 10 },
};

const GLSL_COMMON = /* glsl */`
attribute vec3 restPos;
attribute vec3 restNormal;
varying vec3 vRestPos;
varying vec3 vRestNormal;
`;

const GLSL_FRAG = /* glsl */`
varying vec3 vRestPos;
varying vec3 vRestNormal;
uniform vec3 uColor2;
uniform float uPattern;
uniform float uPatternScale;
uniform float uWeave;
uniform float uWeaveScale;
uniform float uBump;
uniform float uDenim;
uniform float uFuzz;
uniform float uSlub;
uniform float uSheer;
uniform float uSheerDensity;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5;} return s; }

// 2D fabric coordinates (metres) from a tri-planar projection of rest space
vec3 triW(){ vec3 n = abs(normalize(vRestNormal)); n = pow(n, vec3(4.0)); return n / (n.x+n.y+n.z); }

float weaveH(vec2 p, float type){
  if (type < 0.5) return 0.0;
  if (type < 1.5) { // plain weave
    vec2 g = fract(p); vec2 c = floor(p);
    float over = mod(c.x + c.y, 2.0);
    float wx = sin(g.x*3.14159), wy = sin(g.y*3.14159);
    return mix(wy * (0.6 + 0.4*wx), wx * (0.6 + 0.4*wy), over);
  }
  if (type < 2.5) { // jersey knit: rows of V loops
    vec2 g = vec2(p.x, p.y*1.6); vec2 f = fract(g); float side = step(0.5, f.x);
    float v = abs(f.y - mix(f.x, 1.0-f.x, side) * 0.8 - 0.1);
    return 1.0 - smoothstep(0.0, 0.35, v);
  }
  if (type < 3.5) { // twill (denim / tweed): diagonal ribs
    float d = fract((p.x + p.y) * 1.0);
    return smoothstep(0.0, 0.5, d) * smoothstep(1.0, 0.5, d);
  }
  if (type < 4.5) { // chunky knit: stacked chevron stitches
    vec2 g = vec2(p.x*1.0, p.y*1.4); vec2 c = floor(g), f = fract(g);
    float side = step(0.5, f.x);
    float x = mix(f.x*2.0, (1.0-f.x)*2.0, side);
    float h = 1.0 - pow(abs(f.y - 0.35 - x*0.3)*2.2, 2.0);
    return clamp(h,0.,1.) * (0.75 + 0.25*hash12(c));
  }
  if (type < 5.5) { // leather grain
    return fbm(p*0.6) * 0.8 + vnoise(p*3.0)*0.2;
  }
  // lace: floral-ish openwork
  vec2 c = fract(p) - 0.5; float r = length(c);
  float petals = 0.5 + 0.5*cos(atan(c.y,c.x)*6.0);
  return smoothstep(0.32, 0.28, r - petals*0.08) * (1.0 - smoothstep(0.08, 0.04, r));
}

float stripeF(float x, float w){ float f = fract(x); return smoothstep(0.0, 0.02, f) * (1.0 - smoothstep(w, w+0.02, f)); }

float patternMask(vec2 p, float id){
  if (id < 0.5) return 0.0;
  if (id < 1.5) return stripeF(p.y, 0.42);                       // breton
  if (id < 2.5) return stripeF(p.x * 1.0, 0.07);                 // pinstripe (vertical)
  if (id < 3.5) { float a = stripeF(p.x, 0.5), b = stripeF(p.y, 0.5); return (a + b) * 0.5; } // gingham
  if (id < 4.5) { // tartan
    float a = stripeF(p.x, 0.32) * 0.6 + stripeF(p.x*3.0, 0.12) * 0.4;
    float b = stripeF(p.y, 0.32) * 0.6 + stripeF(p.y*3.0, 0.12) * 0.4;
    return clamp((a + b) * 0.62, 0.0, 1.0);
  }
  if (id < 5.5) { vec2 q = p; q.x += 0.5 * mod(floor(q.y), 2.0); vec2 f = fract(q) - 0.5; return 1.0 - smoothstep(0.22, 0.25, length(f)); }
  if (id < 6.5) { // houndstooth
    vec2 f = fract(p*2.0); vec2 c = floor(p*2.0);
    float chk = mod(c.x + c.y, 2.0);
    float tooth = step(f.x + f.y, 1.0) * step(0.5, f.x) + step(f.x + f.y, 0.5);
    return clamp(chk + tooth * (1.0 - chk), 0.0, 1.0);
  }
  if (id < 7.5) { // floral
    vec2 q = p; vec2 c = floor(q); vec2 f = fract(q) - 0.5;
    f += (vec2(hash12(c), hash12(c+7.1)) - 0.5) * 0.35;
    float a = atan(f.y, f.x) + hash12(c+3.0)*6.28; float r = length(f);
    float petal = 0.22 + 0.09*cos(a*5.0);
    float flower = 1.0 - smoothstep(petal, petal+0.02, r);
    float centre = 1.0 - smoothstep(0.05, 0.065, r);
    return clamp(flower - centre*0.6, 0.0, 1.0);
  }
  if (id < 8.5) { // leopard rosettes
    vec2 q = p * 1.0; float n = fbm(q*1.3);
    vec2 c = floor(q); vec2 f = fract(q) - 0.5 + (vec2(hash12(c), hash12(c+5.)) - 0.5)*0.4;
    float r = length(f*vec2(1.0, 1.25)) + (n-0.5)*0.18;
    float ring = smoothstep(0.17, 0.2, r) * (1.0 - smoothstep(0.26, 0.29, r));
    return ring;
  }
  if (id < 9.5) { return 0.5 + 0.5 * sin(p.x * 6.2831); } // rib (shading only)
  // cable knit panels
  float panel = fract(p.x * 0.5);
  float cable = abs(sin(p.y * 3.1416 + sign(panel - 0.5) * panel * 6.2831));
  return smoothstep(0.2, 0.8, cable) * step(0.15, panel) * step(panel, 0.85);
}
`;

export function makeFabricMaterial(opts = {}) {
  const mdef = MATERIALS[opts.material || 'cotton'] || MATERIALS.cotton;
  const pdef = PATTERNS[opts.pattern || 'solid'] || PATTERNS.solid;
  const color = new THREE.Color(opts.color || '#ffffff');
  const color2 = new THREE.Color(opts.color2 || '#1d2433');
  const sheer = opts.sheer ?? 0;
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: mdef.roughness,
    metalness: mdef.metalness || 0,
    sheen: mdef.sheen,
    sheenRoughness: mdef.sheenRoughness,
    sheenColor: color.clone().lerp(new THREE.Color(1, 1, 1), 0.35),
    clearcoat: mdef.clearcoat || 0,
    clearcoatRoughness: 0.2,
    specularIntensity: mdef.specular ?? 0.35,
    side: THREE.DoubleSide,
    transparent: sheer > 0,
    depthWrite: sheer === 0,
  });
  const u = {
    uColor2: { value: color2 },
    uPattern: { value: pdef.id },
    uPatternScale: { value: opts.patternScale || defaultPatternScale(opts.pattern) },
    uWeave: { value: mdef.weave },
    uWeaveScale: { value: mdef.weaveScale },
    uBump: { value: mdef.bump * (opts.bump ?? 1) },
    uDenim: { value: mdef.denim || 0 },
    uFuzz: { value: mdef.fuzz || 0 },
    uSlub: { value: mdef.slub || 0 },
    uSheer: { value: sheer },
    uSheerDensity: { value: opts.density ?? 0.35 },
  };
  m.userData.uniforms = u;
  const wrapLight = mdef.fuzz ? new THREE.Vector3(0.3, 0.3, 0.3) : new THREE.Vector3(0.12, 0.12, 0.12);
  addWrapLighting(m, wrapLight, (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = GLSL_COMMON + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vRestPos = restPos; vRestNormal = restNormal;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_FRAG)
      .replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        vec3 tw = triW();
        vec2 pX = vRestPos.zy, pY = vRestPos.xz, pZ = vRestPos.xy;
        // pattern colour
        float pm = 0.0;
        if (uPattern > 0.5) {
          float sc = uPatternScale;
          pm = patternMask(pX*sc, uPattern) * tw.x + patternMask(pY*sc, uPattern) * tw.y + patternMask(pZ*sc, uPattern) * tw.z;
          if (uPattern > 8.5) { diffuseColor.rgb *= mix(0.82, 1.08, pm); pm = 0.0; }
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, uColor2, clamp(pm, 0.0, 1.0));
        float fineN = fbm(pZ * 160.0) * tw.z + fbm(pX * 160.0) * tw.x + fbm(pY * 160.0) * tw.y;
        if (uDenim > 0.5) {
          // denim: indigo warp / white weft, fading on high-wear areas and fine slub
          float tw2 = fract((pZ.x + pZ.y) * uWeaveScale) * tw.z + fract((pX.x + pX.y) * uWeaveScale) * tw.x + fract((pY.x+pY.y)*uWeaveScale)*tw.y;
          float weft = smoothstep(0.55, 0.9, tw2);
          float fade = fbm(vec2(vRestPos.x*6.0, vRestPos.y*3.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.55 + 0.06, weft * 0.35 + fade * 0.25);
          diffuseColor.rgb *= 0.92 + 0.16 * fineN;
        } else {
          diffuseColor.rgb *= 0.95 + 0.1 * fineN;
        }
        if (uSlub > 0.5) {
          float sl = vnoise(vec2(pZ.x*40.0, pZ.y*900.0)) * tw.z + vnoise(vec2(pX.x*40.0, pX.y*900.0)) * tw.x;
          diffuseColor.rgb *= 0.9 + 0.2 * sl;
          if (uSlub > 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, uColor2, step(0.82, hash12(floor(pZ*700.0)))*0.5);
        }
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        if (uBump > 0.0) {
          vec3 tw3 = triW();
          float h = weaveH(vRestPos.zy * uWeaveScale, uWeave) * tw3.x + weaveH(vRestPos.xz * uWeaveScale, uWeave) * tw3.y + weaveH(vRestPos.xy * uWeaveScale, uWeave) * tw3.z;
          if (uPattern > 9.5) {
            vec2 pzz = vRestPos.xy * uPatternScale; float c = patternMask(pzz, uPattern);
            h += c * 2.0;
          } else if (uPattern > 8.5) {
            h += 0.5 + 0.5 * sin(vRestPos.x * uPatternScale * 6.2831) * tw3.z + 0.5 * sin(vRestPos.z * uPatternScale * 6.2831) * tw3.x;
          }
          vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
          float dhx = dFdx(h), dhy = dFdy(h);
          // fade the micro-bump with distance to avoid aliasing
          float fade = clamp(1.0 - (length(dpdx) + length(dpdy)) * 900.0 / uWeaveScale * 2.0, 0.0, 1.0);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad * uBump * 0.0035 * fade);
        }
      `)
      .replace('#include <opaque_fragment>', /* glsl */`
        if (uSheer > 0.5) {
          // sheer hosiery: denser where the fabric is seen at grazing angles and
          // where it is stretched less; skin shows through at normal incidence
          float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
          float dens = uSheerDensity;
          float a = mix(dens, 1.0, pow(1.0 - ndv, 2.2));
          diffuseColor.a = clamp(a, 0.0, 1.0);
        }
        #include <opaque_fragment>
      `);
  });
  return m;
}

function defaultPatternScale(p) {
  switch (p) {
    case 'stripes': return 45;
    case 'pinstripe': return 70;
    case 'gingham': return 50;
    case 'tartan': return 12;
    case 'polka': return 30;
    case 'houndstooth': return 40;
    case 'floral': return 14;
    case 'leopard': return 13;
    case 'rib': return 260;
    case 'cable': return 22;
    default: return 20;
  }
}

/** Update colour / pattern / material on an existing fabric material in place. */
export function updateFabric(material, opts) {
  const u = material.userData.uniforms;
  if (opts.color) { material.color.set(opts.color); material.sheenColor.copy(material.color).lerp(new THREE.Color(1, 1, 1), 0.35); }
  if (opts.color2) u.uColor2.value.set(opts.color2);
  if (opts.pattern) { u.uPattern.value = PATTERNS[opts.pattern].id; u.uPatternScale.value = defaultPatternScale(opts.pattern); }
}
