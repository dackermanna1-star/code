// Shared materials for the galley / lavatory / door module.
//
// All lit materials are MeshStandardMaterials with vertex colours (tint + baked
// AO from geom.js) and a small "local lamp" injection: up to LAMP_COUNT
// box-limited point lamps (lavatory ceiling lights, galley work lights, the
// daylight spilling in through the open L1 door) that light ONLY the surfaces
// inside their axis-aligned box. This gives enclosed rooms (lavs, galley
// alcoves) their own believable lighting without real light sources leaking
// through walls and without adding to the scene's light count (no shader
// recompiles when they switch on/off).
import * as THREE from 'three';

export const LAMP_COUNT = 8;

export const LAMPS = {
  pos: { value: Array.from({ length: LAMP_COUNT }, () => new THREE.Vector3(0, -50, 0)) },
  col: { value: Array.from({ length: LAMP_COUNT }, () => new THREE.Vector3(0, 0, 0)) },     // rgb * intensity (direct)
  amb: { value: Array.from({ length: LAMP_COUNT }, () => new THREE.Vector3(0, 0, 0)) },     // rgb (bounce fill inside the box)
  bmin: { value: Array.from({ length: LAMP_COUNT }, () => new THREE.Vector3(0, -50, 0)) },
  bmax: { value: Array.from({ length: LAMP_COUNT }, () => new THREE.Vector3(0, -50, 0)) },
  k: { value: new Array(LAMP_COUNT).fill(4) },                                                // distance falloff 1/(1+k d^2)
};

const VERT_PARS = /* glsl */`
varying vec3 vGalleyPos;
`;
const VERT_MAIN = /* glsl */`
{
  vec4 gp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    gp = instanceMatrix * gp;
  #endif
  vGalleyPos = ( modelMatrix * gp ).xyz;
}
`;
const FRAG_PARS = /* glsl */`
#define GALLEY_LAMPS ${LAMP_COUNT}
varying vec3 vGalleyPos;
uniform vec3 uLampPos[ GALLEY_LAMPS ];
uniform vec3 uLampCol[ GALLEY_LAMPS ];
uniform vec3 uLampAmb[ GALLEY_LAMPS ];
uniform vec3 uLampMin[ GALLEY_LAMPS ];
uniform vec3 uLampMax[ GALLEY_LAMPS ];
uniform float uLampK[ GALLEY_LAMPS ];
`;
const FRAG_MAIN = /* glsl */`
{
  for ( int i = 0; i < GALLEY_LAMPS; i ++ ) {
    vec3 bmin = uLampMin[ i ], bmax = uLampMax[ i ];
    vec3 inside3 = step( bmin, vGalleyPos ) * step( vGalleyPos, bmax );
    float inside = inside3.x * inside3.y * inside3.z;
    if ( inside < 0.5 ) continue;
    vec3 lp = ( viewMatrix * vec4( uLampPos[ i ], 1.0 ) ).xyz;
    vec3 lv = lp - geometryPosition;
    float d = max( length( lv ), 0.05 );
    IncidentLight gl;
    gl.direction = lv / d;
    gl.color = uLampCol[ i ] / ( 1.0 + uLampK[ i ] * d * d );
    gl.visible = true;
    RE_Direct( gl, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    reflectedLight.indirectDiffuse += uLampAmb[ i ] * BRDF_Lambert( material.diffuseColor );
  }
}
`;

/** Patch a MeshStandardMaterial with the local lamp lighting. */
export function lampMaterial(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLampPos = LAMPS.pos;
    shader.uniforms.uLampCol = LAMPS.col;
    shader.uniforms.uLampAmb = LAMPS.amb;
    shader.uniforms.uLampMin = LAMPS.bmin;
    shader.uniforms.uLampMax = LAMPS.bmax;
    shader.uniforms.uLampK = LAMPS.k;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <lights_fragment_maps>', FRAG_MAIN + '\n#include <lights_fragment_maps>');
  };
  mat.customProgramCacheKey = () => 'galleyLamps' + LAMP_COUNT;
  return mat;
}

export function createMaterials(app, tex) {
  const A = app.assets;
  const steelT = A.pbr('assets/textures/galley-steel', { repeat: [1, 1] });
  const lamT = A.pbr('assets/textures/galley-laminate', { repeat: [1, 1] });
  const std = (o) => lampMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }));

  const M = {};
  // brushed stainless (galley inserts, work deck, carts, sink, thresholds)
  M.steel = std({ name: 'galley-steel', color: 0xffffff, metalness: 0.72, roughness: 1.15, map: steelT.map, roughnessMap: steelT.roughnessMap, normalMap: steelT.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 2.2 });
  // polished chrome / bright metal (faucet, handles, latches, hinges)
  M.chrome = std({ name: 'galley-chrome', color: 0xffffff, metalness: 1.0, roughness: 0.2, envMapIntensity: 2.5 });
  // textured laminate (monument walls, lav walls, door lining, panels) – tinted per part with vertex colours
  M.plastic = std({ name: 'galley-laminate', color: 0xffffff, metalness: 0.0, roughness: 1.0, map: lamT.map, roughnessMap: lamT.roughnessMap, normalMap: lamT.normalMap, normalScale: new THREE.Vector2(0.2, 0.2) });
  // smooth glossy composite (toilet shroud, vanity, sink surround, oven fronts)
  M.gloss = std({ name: 'galley-gloss', color: 0xffffff, metalness: 0.0, roughness: 0.22, envMapIntensity: 1.0 });
  // matte rubber / dark plastic
  M.rubber = std({ name: 'galley-rubber', color: 0xffffff, metalness: 0.0, roughness: 0.82 });
  // fabric (jumpseat cushions, curtains, coats)
  M.fabric = std({ name: 'galley-fabric', color: 0xffffff, metalness: 0.0, roughness: 0.95, normalMap: tex.weaveNormal, normalScale: new THREE.Vector2(0.6, 0.6) });
  // printed placards / labels (atlas)
  M.placard = std({ name: 'galley-placard', color: 0xffffff, metalness: 0.0, roughness: 0.45, map: tex.atlas, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.placard.userData.noShadow = true;
  // self-lit indicators, displays, lit signs (atlas, unlit). Static ones are baked at a fixed level.
  M.glow = new THREE.MeshBasicMaterial({ name: 'galley-glow', map: tex.glow, vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  M.glow.userData.noShadow = true;
  // dynamic lit signs (instanced, per-instance colour = brightness)
  M.sign = new THREE.MeshBasicMaterial({ name: 'galley-sign', map: tex.glow, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  // glass (oven doors, door viewport, coffee pot)
  M.glass = new THREE.MeshStandardMaterial({ name: 'galley-glass', color: 0xdfe8ea, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.5 });
  M.glass.userData.noShadow = true;
  M.glassDark = new THREE.MeshStandardMaterial({ name: 'galley-glass-dark', color: 0x15191b, metalness: 0.0, roughness: 0.06, transparent: true, opacity: 0.72, depthWrite: false, envMapIntensity: 1.4 });
  M.glassDark.userData.noShadow = true;
  // cheap mirror (env-map) used whenever the planar reflection is not active
  M.mirror = new THREE.MeshStandardMaterial({ name: 'galley-mirror-cheap', color: 0xc8ccce, metalness: 1.0, roughness: 0.04, envMapIntensity: 1.0 });
  // running water (animated, additive-ish)
  M.water = new THREE.ShaderMaterial({
    name: 'galley-water',
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 mv = modelViewMatrix * p;
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uLight;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float streak = 0.55 + 0.45 * sin(vUv.y * 60.0 + uTime * 40.0 + sin(vUv.x * 18.0) * 2.0);
        float a = (0.18 + 0.55 * pow(f, 1.6)) * (0.7 + 0.3 * streak);
        vec3 c = uLight * (0.55 + 0.9 * pow(f, 2.0) + 0.25 * streak);
        gl_FragColor = vec4(c, a);
      }`,
  });
  // FAP touchscreen
  M.screen = new THREE.MeshBasicMaterial({ name: 'galley-fap-screen', map: tex.fapTexture, toneMapped: false });
  // invisible pick proxies
  M.proxy = new THREE.MeshBasicMaterial({ visible: false });
  return M;
}
