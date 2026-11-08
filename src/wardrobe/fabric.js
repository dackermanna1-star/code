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
  silk: { label: 'Silk satin', roughness: 0.38, sheen: 0.8, sheenRoughness: 0.3, weave: 1, weaveScale: 2600, bump: 0.08, specular: 0.55 },
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
#ifdef USE_CUT
attribute float cut;
varying float vCut;
#endif
`;

const GLSL_FRAG = /* glsl */`
#ifdef USE_CUT
varying float vCut;
#endif
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
uniform vec4 uBand;      // yStart, yEnd, type (1 rib, 2 lace, 3 welt), strength
uniform float uDetail;   // 1 jeans, 2 shirt placket, 3 cardigan, 4 zip, 5 blazer
uniform vec4 uLand;      // waistY, hipY, crotchY, garment top Y
uniform vec3 uThread;
uniform vec3 uButton;

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

float lodF(vec2 p){ vec2 w = fwidth(p); return clamp(1.0 - max(w.x, w.y) * 1.6, 0.0, 1.0); }
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
    uBand: { value: new THREE.Vector4(...(opts.band || [0, 0, 0, 0])) },
    uDetail: { value: opts.detail || 0 },
    uLand: { value: new THREE.Vector4(...(opts.land || [1.0, 0.9, 0.8, 1.4])) },
    uThread: { value: new THREE.Color(opts.thread || '#c98b3c') },
    uButton: { value: new THREE.Color(opts.button || '#e8e4dc') },
  };
  m.userData.uniforms = u;
  if (opts.cut) m.defines = { ...(m.defines || {}), USE_CUT: '' };
  const wrapLight = mdef.fuzz ? new THREE.Vector3(0.3, 0.3, 0.3) : new THREE.Vector3(0.12, 0.12, 0.12);
  addWrapLighting(m, wrapLight, (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = GLSL_COMMON + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vRestPos = restPos; vRestNormal = restNormal;\n#ifdef USE_CUT\n vCut = cut;\n#endif');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_FRAG)
      .replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        #ifdef USE_CUT
          if (vCut < 0.0) discard;
          // inside of a shoe: darker lining
          if (!gl_FrontFacing) diffuseColor.rgb *= 0.45;
        #endif
        vec3 tw = triW();
        vec2 pX = vRestPos.zy, pY = vRestPos.xz, pZ = vRestPos.xy;
        // pattern colour
        float pm = 0.0;
        if (uPattern > 0.5) {
          float sc = uPatternScale;
          pm = patternMask(pX*sc, uPattern) * tw.x + patternMask(pY*sc, uPattern) * tw.y + patternMask(pZ*sc, uPattern) * tw.z;
          float plod = lodF(pZ * sc * 2.0);
          pm = mix(0.35, pm, plod);
          if (uPattern > 8.5) { diffuseColor.rgb *= mix(0.82, 1.08, pm); pm = 0.0; }
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, uColor2, clamp(pm, 0.0, 1.0));
        float fineL = lodF(pZ * 160.0);
        float fineN = mix(0.5, fbm(pZ * 160.0) * tw.z + fbm(pX * 160.0) * tw.x + fbm(pY * 160.0) * tw.y, fineL);
        if (uDenim > 0.5) {
          // denim: indigo warp / white weft, fading on high-wear areas and fine slub
          float tw2 = fract((pZ.x + pZ.y) * uWeaveScale) * tw.z + fract((pX.x + pX.y) * uWeaveScale) * tw.x + fract((pY.x+pY.y)*uWeaveScale)*tw.y;
          float weft = mix(0.28, smoothstep(0.55, 0.9, tw2), lodF(pZ * uWeaveScale));
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
        // ---- bands (rib cuffs, lace tops, welts)
        float inBand = 0.0;
        if (uBand.z > 0.5) {
          inBand = step(uBand.x, vRestPos.y) * step(vRestPos.y, uBand.y);
          float ang = atan(vRestPos.x - sign(vRestPos.x) * 0.12, vRestPos.z);
          if (uBand.z < 1.5) { // rib
            float rib = 0.5 + 0.5 * sin(ang * 70.0);
            diffuseColor.rgb *= mix(1.0, 0.86 + 0.14 * rib, inBand);
          } else if (uBand.z < 2.5) { // lace: openwork shown as darker + transparency handled in alpha
            vec2 lp = vec2(ang * 0.06, vRestPos.y) * 160.0;
            vec2 c = fract(lp) - 0.5; float r = length(c);
            float petals = 0.5 + 0.5*cos(atan(c.y,c.x)*6.0);
            float lace = smoothstep(0.34, 0.3, r - petals*0.1) * (1.0 - smoothstep(0.1, 0.06, r));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.75 + 0.35 * lace), inBand);
          } else {
            diffuseColor.rgb *= mix(1.0, 0.9, inBand);
          }
        }
        // ---- construction details in rest space
        vec3 rp = vRestPos;
        float stitch = 0.0;
        if (uDetail > 0.5 && uDetail < 1.5) {
          // jeans: waistband, fly topstitch, back pockets, yoke
          float wb = step(uLand.x - 0.038, rp.y) * step(rp.y, uLand.x + 0.01);
          diffuseColor.rgb *= 1.0 - 0.08 * wb;
          stitch += (1.0 - smoothstep(0.0006, 0.0012, abs(rp.y - (uLand.x - 0.036)))) ;
          stitch += (1.0 - smoothstep(0.0006, 0.0012, abs(rp.y - (uLand.x - 0.004)))) ;
          float front = step(0.02, rp.z);
          float fly = abs(abs(rp.x) - 0.022) ;
          float flyZone = step(uLand.z + 0.06, rp.y) * step(rp.y, uLand.x - 0.04) * step(0.0, rp.x);
          stitch += front * flyZone * (1.0 - smoothstep(0.0006, 0.0013, fly));
          float back = step(rp.z, -0.03);
          vec2 pk = vec2(abs(rp.x) - 0.075, rp.y - (uLand.y - 0.045));
          vec2 d = abs(pk) - vec2(0.05, 0.06);
          float box = abs(max(d.x, d.y));
          float inPk = step(max(d.x,d.y), 0.0);
          stitch += back * (1.0 - smoothstep(0.0007, 0.0014, box)) * step(pk.y, 0.06);
          float yoke = abs(rp.y - (uLand.y + 0.01 + abs(rp.x) * 0.25));
          stitch += back * step(abs(rp.x), 0.17) * (1.0 - smoothstep(0.0006, 0.0012, yoke));
          diffuseColor.rgb *= 1.0 - 0.04 * back * inPk;
          // side & in-seams
          float side = abs(atan(rp.x - sign(rp.x)*0.13, rp.z) - sign(rp.x)*1.5708);
          stitch += step(rp.y, uLand.z) * (1.0 - smoothstep(0.012, 0.02, side)) * 0.6;
        } else if (uDetail > 1.5 && uDetail < 2.5) {
          // shirt: placket + buttons
          float pl = step(0.0, rp.z) * step(abs(rp.x), 0.016);
          diffuseColor.rgb *= 1.0 + 0.04 * pl;
          stitch += step(0.0, rp.z) * (1.0 - smoothstep(0.0005, 0.001, abs(abs(rp.x) - 0.014))) * 0.7;
          float by = mod(rp.y - uLand.w + 0.06, 0.085) - 0.0425;
          float bd = length(vec2(rp.x, by));
          float btn = step(0.0, rp.z) * (1.0 - smoothstep(0.005, 0.0062, bd)) * step(rp.y, uLand.w - 0.03) * step(uLand.y - 0.05, rp.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, uButton * (0.85 + 0.3 * smoothstep(0.006, 0.0, bd)), btn);
        } else if (uDetail > 2.5 && uDetail < 3.5) {
          // cardigan: button band along the front opening edge
          float edge = step(0.02, rp.z) * step(abs(abs(rp.x) - 0.03), 0.012);
          diffuseColor.rgb *= 1.0 - 0.06 * edge;
          float by = mod(rp.y + 0.03, 0.075) - 0.0375;
          float bd = length(vec2(rp.x - 0.03, by));
          float btn = step(0.02, rp.z) * step(0.0, rp.x) * (1.0 - smoothstep(0.0055, 0.0068, bd)) * step(rp.y, uLand.w - 0.05);
          diffuseColor.rgb = mix(diffuseColor.rgb, uButton, btn);
        } else if (uDetail > 3.5 && uDetail < 4.5) {
          // zip down the front
          float zz = step(0.02, rp.z) * (1.0 - smoothstep(0.003, 0.0045, abs(rp.x - 0.012)));
          float teeth = step(0.5, fract(rp.y * 450.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.55), vec3(0.75), teeth), zz);
        } else if (uDetail > 4.5) {
          // blazer: two buttons at the waist on the wrap
          float bd = min(length(vec2(rp.x - 0.01, rp.y - uLand.x)), length(vec2(rp.x - 0.01, rp.y - uLand.x + 0.09)));
          float btn = step(0.03, rp.z) * (1.0 - smoothstep(0.0075, 0.009, bd));
          diffuseColor.rgb = mix(diffuseColor.rgb, uButton, btn);
          // breast pocket welt
          float w = step(0.03, rp.z) * step(abs(rp.y - (uLand.w - 0.17)), 0.004) * step(abs(rp.x - 0.085), 0.045);
          diffuseColor.rgb *= 1.0 - 0.12 * w;
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, uThread, clamp(stitch, 0.0, 1.0) * 0.85);
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
          float fade = lodF(vRestPos.xy * uWeaveScale * 1.5) * lodF(vRestPos.zy * uWeaveScale * 1.5);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad * uBump * 0.0035 * fade);
        }
      `)
      .replace('#include <opaque_fragment>', /* glsl */`
        if (uSheer > 0.5) {
          // sheer hosiery: denser where the fabric is seen at grazing angles,
          // skin shows through at normal incidence
          float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
          float dens = uSheerDensity;
          float a = mix(dens, 1.0, pow(1.0 - ndv, 2.2));
          if (uSheer > 1.5) {
            // fishnet: diamond mesh
            vec2 q = vec2(atan(vRestPos.x - sign(vRestPos.x) * 0.12, vRestPos.z) * 0.07, vRestPos.y) * 110.0;
            vec2 r1 = vec2(q.x + q.y, q.x - q.y);
            vec2 f = abs(fract(r1) - 0.5);
            float net = 1.0 - smoothstep(0.06, 0.12, min(f.x, f.y));
            a = net;
          }
          if (uBand.z > 1.5 && uBand.z < 2.5) a = mix(a, 0.95, step(uBand.x, vRestPos.y) * step(vRestPos.y, uBand.y));
          if (uBand.z > 0.5 && uBand.z < 1.5) a = mix(a, 1.0, step(uBand.x, vRestPos.y) * step(vRestPos.y, uBand.y));
          diffuseColor.a = clamp(a, 0.0, 1.0);
          if (diffuseColor.a < 0.02) discard;
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
