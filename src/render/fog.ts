// Global exponential height fog with sun in-scattering, injected into three's shared fog shader chunks so every
// built-in material (and any ShaderMaterial that includes the fog chunks) gets the same aerial perspective.
//
// Encoding: scene.fog is a HeightFog (a THREE.Fog subclass). Because three only uploads fogNear/fogFar/fogColor
// for linear fog, those uniforms carry the height-fog parameters:
//   fogNear = density at sea level (1/m), fogFar = height falloff (1/m).
// FogExp2 keeps three's stock behaviour. Lit materials also tint the fog toward the sun color (Mie forward
// scattering) using the SunLight uniform already present in their shaders.
import * as THREE from 'three';

export class HeightFog extends THREE.Fog {
  readonly isHeightFog = true;
  constructor(color: THREE.ColorRepresentation, density = 0.0003, falloff = 0.006) {
    super(color, density, falloff);
  }
  get density(): number {
    return this.near;
  }
  set density(v: number) {
    this.near = v;
  }
  get falloff(): number {
    return this.far;
  }
  set falloff(v: number) {
    this.far = v;
  }
}

/** GLSL function computing the fog factor for a camera-relative world offset (shared by sky/water shaders). */
export const HEIGHT_FOG_GLSL = /* glsl */ `
float heightFogFactor( vec3 rel, float camY, float density, float falloff ) {
  float dist = length( rel );
  float t = falloff * rel.y;
  float g = abs( t ) > 1e-4 ? ( 1.0 - exp( - t ) ) / t : 1.0 - 0.5 * t;
  float optical = density * exp( - falloff * max( camY, -50.0 ) ) * dist * g;
  return 1.0 - exp( - optical );
}
`;

let patched = false;

export function patchFogChunks(): void {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogViewPos;
#endif
`;
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogViewPos = mvPosition.xyz;
#endif
`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogViewPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
    ${HEIGHT_FOG_GLSL}
  #endif
#endif
`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #else
    vec3 fogRel = ( vec4( vFogViewPos, 0.0 ) * viewMatrix ).xyz;
    float fogFactor = heightFogFactor( fogRel, cameraPosition.y, fogNear, fogFar );
    vec3 fogTint = fogColor;
    #if defined( RE_Direct ) && ( NUM_SUN_LIGHTS > 0 )
      vec3 fogSunCol = sunLights[ 0 ].color;
      float fogSunMax = max( max( fogSunCol.r, fogSunCol.g ), max( fogSunCol.b, 1e-4 ) );
      float fogCos = max( dot( normalize( vFogViewPos ), sunLights[ 0 ].direction ), 0.0 );
      float fogPhase = pow( fogCos, 8.0 ) * 0.55 + pow( fogCos, 2.0 ) * 0.12;
      fogTint += fogColor * ( fogSunCol / fogSunMax ) * fogPhase * min( fogSunMax * 0.35, 1.5 );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );
  #endif
#endif
`;
}
