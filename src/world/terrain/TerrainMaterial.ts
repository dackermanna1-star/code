// Terrain material: MeshStandardMaterial (three's lighting, shadows, IBL, fog) extended via onBeforeCompile with
//  - CDLOD vertex fetch: heights from a float texture (texelFetch, exact grid values), height-only geomorphing,
//  - splat shading: 9 layers in texture arrays, height-blended, anti-tiling sampling, triplanar rock,
//    macro variation, slope rock, wetness, per-pixel terrain normals + detail normals, cloud shadows.
import * as THREE from 'three';
import { CELL, N, WORLD_SIZE } from './TerrainData';

export const GRID = 32; // quads per node side
export const LAYERS = 9;
/** Meters covered by one texture tile per layer (grass, dry, forest, dirt, mud, rock, sand, gravel, field). */
export const LAYER_TILE_METERS = [3.2, 3.6, 4.0, 3.5, 3.2, 6.0, 4.5, 2.8, 5.0];

export interface TerrainUniforms {
  tHeight: { value: THREE.Texture };
  tTerrainNormal: { value: THREE.Texture };
  tSplatA: { value: THREE.Texture };
  tSplatB: { value: THREE.Texture };
  tLayerAlbedo: { value: THREE.Texture | null };
  tLayerNormal: { value: THREE.Texture | null };
  tMacro: { value: THREE.Texture };
  uCamPos: { value: THREE.Vector3 };
  uMorph: { value: THREE.Vector2[] };
  uLayerScale: { value: number[] };
  uWetness: { value: number };
  uCloudShadow: { value: number };
  uCloudOffset: { value: THREE.Vector2 };
  uCloudCover: { value: number };
  uSunDirW: { value: THREE.Vector3 };
  uDetailStrength: { value: number };
}

const vertexPars = /* glsl */ `
attribute vec4 nodeInfo; // x0, z0, node size (m), lod
uniform sampler2D tHeight;
uniform vec3 uCamPos;
uniform vec2 uMorph[8];
varying vec3 vTerrainPos;
float cdlodH( ivec2 p ) {
  p = clamp( p, ivec2( 0 ), ivec2( ${N - 1} ) );
  return texelFetch( tHeight, p, 0 ).r;
}
void cdlodVertex( out vec3 pos, out vec3 nrm ) {
  float quad = nodeInfo.z / ${GRID.toFixed(1)};
  int stepT = int( quad / ${CELL.toFixed(1)} + 0.5 );
  vec2 g = position.xz;
  ivec2 tp = ivec2( ( nodeInfo.xy + g * quad ) / ${CELL.toFixed(1)} + 0.5 );
  float h = cdlodH( tp );
  vec2 wp = vec2( tp ) * ${CELL.toFixed(1)};
  vec2 mr = uMorph[ int( nodeInfo.w + 0.5 ) ];
  float morph = clamp( ( distance( vec3( wp.x, h, wp.y ), uCamPos ) - mr.x ) / ( mr.y - mr.x ), 0.0, 1.0 );
  ivec2 odd = ivec2( mod( g, 2.0 ) + 0.5 );
  if ( morph > 0.0 && odd.x + odd.y > 0 ) {
    float hc;
    if ( odd.x == 1 && odd.y == 1 ) hc = 0.5 * ( cdlodH( tp + ivec2( - stepT, stepT ) ) + cdlodH( tp + ivec2( stepT, - stepT ) ) );
    else if ( odd.x == 1 ) hc = 0.5 * ( cdlodH( tp - ivec2( stepT, 0 ) ) + cdlodH( tp + ivec2( stepT, 0 ) ) );
    else hc = 0.5 * ( cdlodH( tp - ivec2( 0, stepT ) ) + cdlodH( tp + ivec2( 0, stepT ) ) );
    h = mix( h, hc, morph );
  }
  float hl = cdlodH( tp - ivec2( 1, 0 ) ), hr = cdlodH( tp + ivec2( 1, 0 ) );
  float hd = cdlodH( tp - ivec2( 0, 1 ) ), hu = cdlodH( tp + ivec2( 0, 1 ) );
  nrm = normalize( vec3( hl - hr, ${(2 * CELL).toFixed(1)}, hd - hu ) );
  pos = vec3( wp.x, h, wp.y );
}
`;

const fragmentPars = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2D tTerrainNormal;
uniform sampler2D tSplatA;
uniform sampler2D tSplatB;
uniform sampler2DArray tLayerAlbedo;
uniform sampler2DArray tLayerNormal;
uniform sampler2D tMacro;
uniform float uLayerScale[${LAYERS}];
uniform float uWetness;
uniform float uCloudShadow;
uniform vec2 uCloudOffset;
uniform float uCloudCover;
uniform vec3 uSunDirW;
uniform float uDetailStrength;
varying vec3 vTerrainPos;

vec3 tSrgbToLinear( vec3 c ) {
  return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) );
}

// Anti-tiling: two samples at noise-indexed offsets, blended (I. Quilez, "texture repetition" technique 3).
void tSampleLayer( float layer, vec2 uv, vec2 dx, vec2 dy, float k, out vec4 alb, out vec4 nrm ) {
  float l = k * 8.0;
  float ia = floor( l ), f = fract( l );
  vec2 oa = sin( vec2( 3.0, 7.0 ) * ia );
  vec2 ob = sin( vec2( 3.0, 7.0 ) * ( ia + 1.0 ) );
  vec4 a1 = textureGrad( tLayerAlbedo, vec3( uv + oa, layer ), dx, dy );
  vec4 a2 = textureGrad( tLayerAlbedo, vec3( uv + ob, layer ), dx, dy );
  vec4 n1 = textureGrad( tLayerNormal, vec3( uv + oa, layer ), dx, dy );
  vec4 n2 = textureGrad( tLayerNormal, vec3( uv + ob, layer ), dx, dy );
  float b = smoothstep( 0.2, 0.8, f - 0.1 * dot( a1.rgb - a2.rgb, vec3( 1.0 ) ) );
  alb = mix( a1, a2, b );
  nrm = mix( n1, n2, b );
}
`;

const mapFragment = /* glsl */ `
  vec2 tXZ = vTerrainPos.xz;
  vec3 tN = normalize( texture2D( tTerrainNormal, ( tXZ / ${CELL.toFixed(1)} + 0.5 ) / ${N.toFixed(1)} ).xyz * 2.0 - 1.0 );
  vec4 tSA = texture2D( tSplatA, tXZ / ${WORLD_SIZE.toFixed(1)} );
  vec4 tSB = texture2D( tSplatB, tXZ / ${WORLD_SIZE.toFixed(1)} );
  float tW[ ${LAYERS} ];
  tW[ 1 ] = tSA.r; tW[ 2 ] = tSA.g; tW[ 3 ] = tSA.b; tW[ 4 ] = tSA.a;
  tW[ 5 ] = tSB.r; tW[ 6 ] = tSB.g; tW[ 7 ] = tSB.b; tW[ 8 ] = tSB.a;
  tW[ 0 ] = max( 0.0, 1.0 - ( tSA.r + tSA.g + tSA.b + tSA.a + tSB.r + tSB.g + tSB.b + tSB.a ) );
  vec4 tMac = texture2D( tMacro, tXZ / 700.0 );
  vec4 tMac2 = texture2D( tMacro, tXZ / 83.0 );
  // per-pixel slope rock (finer than the 4 m splat)
  float tRock = smoothstep( 0.80, 0.64, tN.y + ( tMac2.g - 0.5 ) * 0.1 );
  for ( int k = 0; k < ${LAYERS}; k ++ ) tW[ k ] *= 1.0 - tRock;
  tW[ 5 ] += tRock;
  vec2 tDX = dFdx( tXZ ), tDY = dFdy( tXZ );
  vec2 tDXxy = dFdx( vTerrainPos.xy ), tDYxy = dFdy( vTerrainPos.xy );
  vec2 tDXzy = dFdx( vTerrainPos.zy ), tDYzy = dFdy( vTerrainPos.zy );
  float tK = tMac2.r;
  vec4 tLA[ ${LAYERS} ];
  vec4 tLN[ ${LAYERS} ];
  float tHW[ ${LAYERS} ];
  float tHMax = -1.0;
  // triplanar weights for rock
  vec3 tTriW = pow( abs( tN ), vec3( 4.0 ) );
  tTriW /= dot( tTriW, vec3( 1.0 ) );
  for ( int k = 0; k < ${LAYERS}; k ++ ) {
    tHW[ k ] = -1.0;
    tLA[ k ] = vec4( 0.0 );
    tLN[ k ] = vec4( 0.5, 0.5, 1.0, 0.5 );
    if ( tW[ k ] > 0.012 ) {
      float sc = uLayerScale[ k ];
      if ( k == 5 && tTriW.y < 0.92 ) {
        vec4 a, n, a2, n2, a3, n3;
        vec2 uxz = tXZ * sc, uxy = vTerrainPos.xy * sc, uzy = vTerrainPos.zy * sc;
        tSampleLayer( 5.0, uxz, tDX * sc, tDY * sc, tK, a, n );
        tSampleLayer( 5.0, uxy, tDXxy * sc, tDYxy * sc, tK, a2, n2 );
        tSampleLayer( 5.0, uzy, tDXzy * sc, tDYzy * sc, tK, a3, n3 );
        tLA[ k ] = a * tTriW.y + a2 * tTriW.z + a3 * tTriW.x;
        tLN[ k ] = n * tTriW.y + n2 * tTriW.z + n3 * tTriW.x;
      } else {
        tSampleLayer( float( k ), tXZ * sc, tDX * sc, tDY * sc, tK, tLA[ k ], tLN[ k ] );
      }
      tHW[ k ] = tW[ k ] + tLN[ k ].a * 0.45;
      tHMax = max( tHMax, tHW[ k ] );
    }
  }
  vec3 tAlb = vec3( 0.0 );
  float tRough = 0.0, tAO = 0.0, tWS = 0.0;
  vec2 tNXY = vec2( 0.0 );
  float tPorous = 0.0;
  for ( int k = 0; k < ${LAYERS}; k ++ ) {
    if ( tHW[ k ] < -0.5 ) continue;
    float b = max( tHW[ k ] - tHMax + 0.2, 0.0 ) * tW[ k ];
    tAlb += tSrgbToLinear( tLA[ k ].rgb ) * b;
    tRough += tLA[ k ].a * b;
    tNXY += ( tLN[ k ].rg * 2.0 - 1.0 ) * b;
    tAO += tLN[ k ].b * b;
    tPorous += ( k == 3 || k == 4 || k == 6 || k == 8 ? 1.0 : k == 5 || k == 7 ? 0.35 : 0.6 ) * b;
    tWS += b;
  }
  tWS = max( tWS, 1e-4 );
  tAlb /= tWS; tRough /= tWS; tNXY /= tWS; tAO /= tWS; tPorous /= tWS;
  // macro variation: large-scale brightness/hue shifts break up repetition at distance
  float tGrassy = tW[ 0 ] + tW[ 1 ];
  tAlb *= mix( 0.84, 1.14, tMac.r );
  tAlb = mix( tAlb, tAlb * vec3( 1.08, 1.02, 0.86 ), ( tMac.g - 0.35 ) * 0.9 * tGrassy );
  // wetness: darker, glossier, especially porous ground
  float tWet = uWetness * mix( 0.6, 1.0, tPorous ) * smoothstep( 0.55, 0.9, tN.y );
  tAlb *= 1.0 - 0.38 * tWet;
  tRough = mix( tRough, 0.22, tWet * 0.85 );
  diffuseColor.rgb *= tAlb;
  #if defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 1
    diffuseColor.rgb = vec3( 0.25 );
  #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 2
    diffuseColor.rgb = vec3( tW[ 0 ], tW[ 1 ] + tW[ 6 ], tW[ 2 ] + tW[ 5 ] ) * 0.5;
  #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 3
    diffuseColor.rgb = tLA[ 0 ].rgb;
  #endif
`;

const normalFragment = /* glsl */ `
  float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
  vec3 tT = normalize( vec3( 1.0, 0.0, 0.0 ) - tN * tN.x );
  vec3 tB = normalize( vec3( 0.0, 0.0, 1.0 ) - tN * tN.z );
  float tDet = uDetailStrength * ( 1.0 - smoothstep( 120.0, 600.0, length( vTerrainPos - cameraPosition ) ) * 0.6 );
  vec3 tNW = normalize( tN + ( tT * tNXY.x + tB * tNXY.y ) * tDet );
  vec3 normal = normalize( ( viewMatrix * vec4( tNW, 0.0 ) ).xyz );
  vec3 nonPerturbedNormal = normal;
`;

const aoFragment = /* glsl */ `
  #include <aomap_fragment>
  reflectedLight.indirectDiffuse *= mix( 1.0, tAO, 0.85 );
  reflectedLight.indirectSpecular *= mix( 1.0, tAO, 0.85 );
  // moving cloud shadows on the direct light
  {
    vec2 cp = ( vTerrainPos.xz + uSunDirW.xz / max( uSunDirW.y, 0.15 ) * 1500.0 ) / 9000.0 + uCloudOffset;
    float cn = texture2D( tMacro, cp ).r * 0.6 + texture2D( tMacro, cp * 2.7 + 0.31 ).g * 0.28 + texture2D( tMacro, cp * 7.3 - 0.17 ).b * 0.12;
    float ct = mix( 0.66, 0.22, clamp( uCloudCover, 0.0, 1.0 ) );
    float cd = smoothstep( ct, ct + 0.16, cn );
    float cs = 1.0 - cd * uCloudShadow;
    reflectedLight.directDiffuse *= cs;
    reflectedLight.directSpecular *= cs;
  }
`;

export function createTerrainMaterial(uniforms: TerrainUniforms): { material: THREE.MeshStandardMaterial; depthMaterial: THREE.MeshDepthMaterial } {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  material.name = 'terrain';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertexPars)
      .replace('#include <beginnormal_vertex>', 'vec3 cdlodPos, cdlodNrm;\ncdlodVertex( cdlodPos, cdlodNrm );\nvec3 objectNormal = cdlodNrm;\nvTerrainPos = cdlodPos;')
      .replace('#include <begin_vertex>', 'vec3 transformed = cdlodPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fragmentPars)
      .replace('#include <map_fragment>', mapFragment)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_begin>', normalFragment)
      .replace('#include <aomap_fragment>', aoFragment)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        #if defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 4
          gl_FragColor = vec4( tNW * 0.5 + 0.5, 1.0 );
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 5
          gl_FragColor = vec4( vec3( fract( vTerrainPos.y / 10.0 ) ), 1.0 );
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 6
          gl_FragColor = vec4( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, 1.0 );
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 7
          #if NUM_SUN_LIGHTS > 0
            gl_FragColor = vec4( sunLights[ 0 ].color * 0.1, 1.0 );
          #else
            gl_FragColor = vec4( 1.0, 0.0, 1.0, 1.0 );
          #endif
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 8
          gl_FragColor = vec4( diffuseColor.rgb, 1.0 );
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 9
          gl_FragColor = vec4( vec3( tRough, tAO, tWS ), 1.0 );
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 10
          gl_FragColor = vec4( tNXY * 0.5 + 0.5, 0.5, 1.0 );
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 12
          gl_FragColor = vec4( tN * 0.5 + 0.5, 1.0 );
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 13
          gl_FragColor = vec4( tSA.b, tSB.r, tRock, 1.0 );
        #elif defined( TERRAIN_DEBUG ) && TERRAIN_DEBUG == 11
          gl_FragColor = vec4( tSrgbToLinear( tLA[ 3 ].rgb ) * 3.0, 1.0 );
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'terrain-cdlod-v1';

  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depthMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { tHeight: uniforms.tHeight, uCamPos: uniforms.uCamPos, uMorph: uniforms.uMorph });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertexPars)
      .replace('#include <begin_vertex>', 'vec3 cdlodPos, cdlodNrm;\ncdlodVertex( cdlodPos, cdlodNrm );\nvTerrainPos = cdlodPos;\nvec3 transformed = cdlodPos;');
  };
  depthMaterial.customProgramCacheKey = () => 'terrain-cdlod-depth-v1';
  return { material, depthMaterial };
}

export function layerScales(): number[] {
  return LAYER_TILE_METERS.map((m) => 1 / m);
}
