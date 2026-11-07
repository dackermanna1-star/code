// =============================================================================
// Shader patches shared by our aircraft's materials:
//
//  * WING FLEX – vertices outboard of the wing root are displaced vertically by
//    a quadratic span function (tip deflection = uFlex metres). Applied in world
//    (= aircraft-local) space so every wing-mounted part (flaps on pivots,
//    slats, lights...) bends consistently. Masked to the wing region (z < 11)
//    so the horizontal stabiliser is unaffected.
//  * LOCAL LIGHTS – the aircraft's own lights (strobes, nav, wing inspection,
//    logo, beacons) illuminate only the aircraft's own materials. They are
//    evaluated as extra analytic lights (GGX) without adding real Three.js lights
//    to the outside scene (which would recompile / slow every terrain shader).
// =============================================================================
import * as THREE from 'three';

export const FL_N = 8;   // number of local lights

export const SHARED = {
  uFlex: { value: 0 },                     // tip deflection (m), + up
  uFlexRoll: { value: 0 },                 // asymmetric part (right tip extra)
  uFLPos: { value: Array.from({ length: FL_N }, () => new THREE.Vector3()) },
  uFLCol: { value: Array.from({ length: FL_N }, () => new THREE.Vector3()) },
  // xyz = spot direction (world), w = cos(outer cone) or -2 for an omni light
  uFLDir: { value: Array.from({ length: FL_N }, () => new THREE.Vector4(0, 0, 1, -2)) },
};

const FLEX_GLSL = /* glsl */`
uniform float uFlex;
uniform float uFlexRoll;
float exteriorFlex(vec3 p) {
  float s = clamp((abs(p.x) - 1.9) / 15.25, 0.0, 1.25);
  float m = 1.0 - smoothstep(10.5, 11.5, p.z);
  return (uFlex + uFlexRoll * sign(p.x)) * s * s * m;
}
`;

const PROJECT_FLEX = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 xWP = modelMatrix * mvPosition;
xWP.y += exteriorFlex( xWP.xyz );
mvPosition = viewMatrix * xWP;
gl_Position = projectionMatrix * mvPosition;
`;

const WORLDPOS_FLEX = /* glsl */`
#include <worldpos_vertex>
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  worldPosition.y += exteriorFlex( worldPosition.xyz );
#endif
`;

const FL_PARS = /* glsl */`
uniform vec3 uFLPos[${FL_N}];
uniform vec3 uFLCol[${FL_N}];
uniform vec4 uFLDir[${FL_N}];
`;

const FL_APPLY = /* glsl */`
#include <lights_fragment_end>
{
  for ( int i = 0; i < ${FL_N}; i ++ ) {
    vec3 lc = uFLCol[ i ];
    if ( lc.r + lc.g + lc.b <= 0.0 ) continue;
    vec3 lpv = ( viewMatrix * vec4( uFLPos[ i ], 1.0 ) ).xyz;
    vec3 Lv = lpv - geometryPosition;
    float d2 = max( dot( Lv, Lv ), 1e-4 );
    Lv *= inversesqrt( d2 );
    float att = 1.0 / ( d2 + 0.6 );
    vec4 sd = uFLDir[ i ];
    if ( sd.w > -1.5 ) {
      vec3 dv = normalize( ( viewMatrix * vec4( sd.xyz, 0.0 ) ).xyz );
      float cd = dot( -Lv, dv );
      att *= smoothstep( sd.w, mix( sd.w, 1.0, 0.45 ), cd );
    }
    float ndl = saturate( dot( geometryNormal, Lv ) );
    vec3 irr = lc * ( att * ndl );
    reflectedLight.directDiffuse += irr * BRDF_Lambert( material.diffuseColor );
    reflectedLight.directSpecular += irr * BRDF_GGX( Lv, geometryViewDir, geometryNormal, material );
  }
}
`;

/**
 * Patch a MeshStandard/PhysicalMaterial for flex and/or local lights.
 * Returns the material (also sets a customDepthMaterial factory hint).
 */
export function patchExterior(mat, { flex = true, local = true, extra = null } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    if (flex) {
      shader.uniforms.uFlex = SHARED.uFlex;
      shader.uniforms.uFlexRoll = SHARED.uFlexRoll;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${FLEX_GLSL}`)
        .replace('#include <project_vertex>', PROJECT_FLEX)
        .replace('#include <worldpos_vertex>', WORLDPOS_FLEX);
    }
    if (local) {
      shader.uniforms.uFLPos = SHARED.uFLPos;
      shader.uniforms.uFLCol = SHARED.uFLCol;
      shader.uniforms.uFLDir = SHARED.uFLDir;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FL_PARS}`)
        .replace('#include <lights_fragment_end>', FL_APPLY);
    }
    if (extra) extra(shader);
  };
  const key = `ext:${flex ? 1 : 0}${local ? 1 : 0}${extra ? ':' + (mat.userData.extraKey || 'x') : ''}`;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key + prevKey();
  mat.userData.exteriorFlex = flex;
  return mat;
}

let _depthMat = null;
/** Depth material with the same flex (for shadow casting meshes). */
export function flexDepthMaterial() {
  if (_depthMat) return _depthMat;
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlex = SHARED.uFlex;
    shader.uniforms.uFlexRoll = SHARED.uFlexRoll;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FLEX_GLSL}`)
      .replace('#include <project_vertex>', PROJECT_FLEX);
  };
  m.customProgramCacheKey = () => 'extFlexDepth';
  _depthMat = m;
  return m;
}

/** Configure a mesh of our aircraft: shadows + flex depth material. */
export function setupMesh(mesh, { cast = true, receive = true } = {}) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  if (cast) mesh.customDepthMaterial = flexDepthMaterial();
  return mesh;
}
