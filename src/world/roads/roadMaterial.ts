// Road surface material: MeshStandardMaterial + procedural asphalt / dirt-track / concrete-pad shading in local
// road space (uv.x = meters across from the centerline, uv.y = meters along), worn alpha-blended edges, lane
// markings (masked at junctions), wetness. Drawn as transparent, depth-tested, no depth write, polygonOffset.
import * as THREE from 'three';

export type RoadKind = 0 | 1 | 2; // 0 asphalt, 1 dirt, 2 concrete pad

export interface RoadUniforms {
  tNoise: { value: THREE.Texture };
  uWetness: { value: number };
}

const vertPars = /* glsl */ `
attribute vec4 roadInfo; // x: half width, y: marking mask (0..1), z: kind, w: lane markings enabled
attribute vec2 roadUv;   // x: meters across from the centerline (pads: signed distance to the edge), y: meters along
varying vec4 vRoad;
varying vec2 vRoadUv;
varying vec3 vRoadW;
`;

const fragPars = /* glsl */ `
uniform sampler2D tNoise;
uniform float uWetness;
varying vec4 vRoad;
varying vec2 vRoadUv;
varying vec3 vRoadW;
float rHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
`;

const fragMap = /* glsl */ `
float hw = vRoad.x;
float ax = abs( vRoadUv.x );
float kind = vRoad.z;
vec4 nA = texture2D( tNoise, vRoadW.xz / 37.0 );
vec4 nB = texture2D( tNoise, vRoadW.xz / 5.3 );
vec4 nC = texture2D( tNoise, vRoadW.xz / 0.9 );
vec3 rc;
float rRough;
float rEdge;
float rPuddle = 0.0;
if ( kind < 0.5 ) {
  // asphalt: aggregate speckle, patches, wheel tracks, cracks
  float tone = 0.055 + 0.03 * nA.r + 0.02 * ( nC.b - 0.5 ) + 0.012 * ( rHash( floor( vRoadW.xz * 30.0 ) ) - 0.5 );
  float patchy = smoothstep( 0.62, 0.66, nB.g ) * 0.025;
  float wheel = exp( -pow( ( ax - hw * 0.5 ) / ( hw * 0.18 ), 2.0 ) ) * 0.012;
  float crack = smoothstep( 0.8, 0.95, nB.a ) * smoothstep( 0.45, 0.65, nA.g );
  rc = vec3( tone + patchy - wheel ) * vec3( 1.0, 1.0, 1.04 );
  rc *= 1.0 - crack * 0.5;
  rRough = 0.82 - wheel * 4.0;
  // markings: dashed center line, solid edge lines (worn)
  float mk = 0.0;
  if ( vRoad.w > 0.5 ) {
    float wear = smoothstep( 0.25, 0.55, nC.r + nB.r * 0.4 );
    float centre = step( ax, 0.075 ) * step( fract( vRoadUv.y / 9.0 ), 0.45 );
    float edgeL = step( abs( ax - ( hw - 0.35 ) ), 0.07 );
    mk = max( centre, edgeL ) * wear * vRoad.y;
  }
  rc = mix( rc, vec3( 0.55, 0.55, 0.5 ), mk );
  rRough = mix( rRough, 0.6, mk );
  rEdge = 1.0 - smoothstep( hw - 0.15, hw + 0.45, ax + ( nB.r - 0.5 ) * 0.5 );
  rPuddle = smoothstep( 0.68, 0.75, nA.b ) * ( 1.0 - mk );
} else if ( kind < 1.5 ) {
  // dirt track: compacted soil, two tire ruts, grassy crown
  float n = nB.r * 0.6 + nC.g * 0.4;
  vec3 soil = mix( vec3( 0.10, 0.075, 0.045 ), vec3( 0.21, 0.16, 0.10 ), n );
  float rut = exp( -pow( ( ax - 0.9 ) / 0.35, 2.0 ) );
  float crown = exp( -pow( ax / 0.35, 2.0 ) ) * smoothstep( 0.3, 0.6, nC.r );
  float pebble = step( 0.86, rHash( floor( vRoadW.xz * 18.0 ) ) ) * 0.06;
  rc = soil * ( 1.0 - rut * 0.18 ) + pebble;
  rc = mix( rc, vec3( 0.08, 0.11, 0.035 ), crown * 0.7 );
  rRough = 0.95 - rut * 0.15;
  rEdge = 1.0 - smoothstep( hw - 0.6, hw + 0.7, ax + ( nB.g - 0.5 ) * 1.2 );
  rPuddle = rut * smoothstep( 0.6, 0.72, nA.b );
} else {
  // concrete pads: slabs with joints and stains
  vec2 slab = vRoadW.xz / 4.0;
  vec2 f = abs( fract( slab ) - 0.5 );
  float joint = smoothstep( 0.485, 0.495, max( f.x, f.y ) );
  float tone = 0.12 + 0.045 * nA.r + 0.03 * ( rHash( floor( slab ) ) - 0.5 ) + 0.015 * ( nC.g - 0.5 );
  float stain = smoothstep( 0.6, 0.8, nB.b ) * 0.06;
  rc = vec3( tone - stain ) * vec3( 1.0, 0.99, 0.96 );
  rc *= 1.0 - joint * 0.45;
  rRough = 0.88;
  rEdge = 1.0 - smoothstep( -0.5, 1.2, vRoadUv.x + ( nB.r - 0.5 ) * 1.5 );
  rPuddle = smoothstep( 0.7, 0.78, nA.b ) * 0.6;
}
float rWet = uWetness;
rc *= 1.0 - rWet * 0.35;
rRough = mix( rRough, 0.25, rWet * 0.6 );
rRough = mix( rRough, 0.05, rWet * rPuddle );
diffuseColor.rgb = rc;
diffuseColor.a = clamp( rEdge, 0.0, 1.0 );
`;

export function createRoadMaterial(u: RoadUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true, depthWrite: false });
  m.name = 'road';
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -6;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertPars)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoad = roadInfo;\nvRoadUv = roadUv;\nvRoadW = ( modelMatrix * vec4( position, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fragPars)
      .replace('#include <map_fragment>', fragMap)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rRough;');
  };
  m.customProgramCacheKey = () => 'road-v1';
  return m;
}
