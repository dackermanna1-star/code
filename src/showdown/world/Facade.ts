import * as THREE from 'three';
import { RAMP_WORLD } from '../render/Toon';
import { DAY } from './Sky';

/** Uniforms shared by every facade (sky reflected in the glass). */
export const FACADE_U = {
  uZenith: { value: DAY.zenith.clone() },
  uHorizon: { value: DAY.horizon.clone() },
  uSunDir: { value: DAY.sunDir.clone() },
  uSunCol: { value: DAY.sunColor.clone() },
  uTime: { value: 0 },
};

/** Facade styles (aFac.x). */
export const STYLE = { CAP: -1, GRID: 0, RIBBON: 1, CURTAIN: 2, FINS: 3, LATTICE: 4, PLAIN: 5, SHOPS: 6 } as const;

const VERT_PARS = /* glsl */ `
attribute vec4 aFac; attribute vec4 aBox; attribute vec3 aGlass;
varying vec4 vFac; varying vec4 vBox; varying vec3 vGlass; varying vec3 vOP; varying vec3 vON;
`;

const FRAG_PARS = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uTime;
varying vec4 vFac; varying vec4 vBox; varying vec3 vGlass; varying vec3 vOP; varying vec3 vON;
float fh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float fn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 skyRefl(vec3 r){
  float h = clamp(r.y, -1.0, 1.0);
  vec3 c = mix(uHorizon * 1.05, uZenith * 1.2, pow(max(h, 0.0), 0.6));
  c = mix(c, uHorizon * 0.55 + vec3(0.04, 0.04, 0.05), smoothstep(0.02, -0.2, h));
  float s = max(dot(r, uSunDir), 0.0);
  c += uSunCol * (pow(s, 300.0) * 6.0 + pow(s, 20.0) * 0.25);
  return c;
}
float edgeLine(float d){ float w = fwidth(d); return 1.0 - smoothstep(0.55, 1.45, d / max(w, 1e-5)); }
`;

/**
 * Cel-shaded building material: windows, mullions, glass that mirrors the
 * sky, ink lines on the corners. Pattern comes from per-vertex attributes in
 * the building's own frame, so cut pieces keep their facades.
 */
export function facadeMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: RAMP_WORLD, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FACADE_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFac = aFac; vBox = aBox; vGlass = aGlass; vOP = position; vON = normal;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 facEmit = vec3(0.0);
        float facInk = 0.0;
        {
          float style = vFac.x;
          vec3 on = normalize(vON);
          float fl = vFac.y; float bay = vFac.z; float seed = vFac.w;
          bool side = abs(on.y) < 0.5;
          float u = abs(on.x) > abs(on.z) ? vOP.z * sign(on.x) : -vOP.x * sign(on.z);
          float hw = abs(on.x) > abs(on.z) ? vBox.y : vBox.x;
          if (style > 3.5 && style < 4.5) u = atan(vOP.z, vOP.x) * vBox.x;
          float v = vOP.y - vBox.w;
          vec3 base = diffuseColor.rgb;
          // view-space reflection back into world space
          vec3 nV = normalize(vNormal);
          vec3 rV = reflect(-normalize(vViewPosition), nV);
          vec3 rW = (vec4(rV, 0.0) * viewMatrix).xyz;
          float fres = 0.25 + 0.75 * pow(1.0 - clamp(dot(nV, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          if (style < -0.5) {
            // cut face: concrete with slabs, columns and rebar
            float slab = edgeLine(abs(fract(v / fl + 0.02) - 0.02) * fl * 4.0);
            float n = fn(vOP.xz * 1.7 + vOP.y * 0.3);
            base = vec3(0.56, 0.54, 0.5) * (0.85 + 0.25 * n);
            base = mix(base, vec3(0.2, 0.19, 0.18), slab * 0.85);
            float col = step(0.94, fract(dot(vOP.xz, vec2(0.7071)) / (bay * 3.0)));
            base = mix(base, base * 0.7, col);
          } else if (side && style < 5.5) {
            vec2 cell = vec2(u / bay, v / fl);
            vec2 f = fract(cell);
            vec2 id = floor(cell);
            float r = fh(id + seed * 13.0);
            float r2 = fh(id * 1.7 + seed * 5.0 + 3.0);
            float win = 0.0;
            float frame = 0.0;
            if (style < 0.5) {
              win = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.88);
              frame = step(0.16, f.x) * step(f.x, 0.84) * step(0.26, f.y) * step(f.y, 0.92) * (1.0 - win);
            } else if (style < 1.5) {
              win = step(0.34, f.y) * step(f.y, 0.94) * step(0.025, abs(f.x - 0.5) * 2.0 - 0.0) * step(abs(f.x - 0.5), 0.48);
              frame = step(0.3, f.y) * step(f.y, 0.97) * (1.0 - win);
            } else if (style < 2.5) {
              win = step(0.06, f.y) * step(0.035, f.x) * step(f.x, 0.965);
              frame = 1.0 - win;
            } else if (style < 3.5) {
              win = step(0.3, f.x) * step(0.08, f.y);
              frame = (1.0 - win) * step(f.x, 0.3);
            } else {
              // diamond lattice wrapping the tower
              vec2 q = vec2(u * 0.5 + v * 0.35, -u * 0.5 + v * 0.35) / bay;
              vec2 g = abs(fract(q) - 0.5);
              float bar = 1.0 - smoothstep(0.36, 0.44, max(g.x, g.y));
              win = bar;
              frame = 1.0 - bar;
              r = fh(floor(q) + seed);
            }
            // anime glass: the sky mirrored in clean panes, a slow sweep of reflection across the facade,
            // a few dark or curtained windows, one soft diagonal glare band
            vec3 sky = skyRefl(normalize(rW));
            float sweep = fn(vec2(u, v) * 0.018 + seed * 7.0);
            float gb = fract((u * 0.6 + v) / 60.0 + seed);
            float glare = smoothstep(0.0, 0.08, gb) * (1.0 - smoothstep(0.1, 0.22, gb));
            vec3 interior = vec3(0.03, 0.04, 0.055);
            float dark = step(r, 0.12);
            float blinds = step(0.9, r2) * step(style, 2.5);
            vec3 refl = vGlass * 0.45 + sky * (0.45 + 0.35 * sweep);
            vec3 glass = mix(refl, interior, dark * 0.75);
            glass = mix(glass, vec3(0.5, 0.52, 0.54), blinds * 0.55);
            glass *= 0.75 + 0.35 * fres;
            glass += sky * glare * 0.18;
            base = mix(base, base * 0.62, frame * 0.6);
            base = mix(base, glass * 0.35, win);
            facEmit += glass * win * 0.75;
            // floor slabs inked between storeys
            facInk = max(facInk, edgeLine(abs(fract(v / fl) - 0.0) * fl * 6.0) * 0.25 * step(style, 3.5));
          } else if (side && style > 5.5) {
            // street-level shops: tall glass, signs above
            float f = fract(u / bay);
            float win = step(0.06, f) * step(f, 0.94) * step(0.4, v) * step(v, 3.3);
            vec3 sky = skyRefl(normalize(rW));
            vec3 glass = mix(vec3(0.05, 0.06, 0.07), sky * 0.6, fres);
            base = mix(base, glass * 0.35, win);
            facEmit += glass * win * 0.7;
            float sign = step(3.5, v) * step(v, 4.6) * step(0.1, f) * step(f, 0.9);
            base = mix(base, mix(vec3(0.85, 0.2, 0.15), vec3(0.15, 0.35, 0.8), step(0.5, fh(vec2(floor(u / bay), seed)))), sign);
          }
          if (!side && style > -0.5) {
            // roofs: concrete with a parapet line
            float n = fn(vOP.xz * 0.6);
            base *= 0.86 + 0.18 * n;
            if (style < 3.5 || style > 4.5) {
              float dEdge = min(vBox.x - abs(vOP.x), vBox.y - abs(vOP.z));
              facInk = max(facInk, edgeLine(dEdge) * 0.9);
              base = mix(base, base * 0.7, 1.0 - smoothstep(0.5, 0.9, dEdge));
            }
          }
          if (side && style > -0.5 && (style < 3.5 || style > 4.5)) {
            facInk = max(facInk, edgeLine(hw - abs(u)));
            facInk = max(facInk, edgeLine(vBox.z - vOP.y));
            facInk = max(facInk, edgeLine(vOP.y - vBox.w) * 0.8);
          }
          diffuseColor.rgb = base;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += facEmit;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight = mix(outgoingLight, outgoingLight * 0.12 + vec3(0.02, 0.02, 0.03), facInk * 0.9);
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'facade';
  return m;
}
