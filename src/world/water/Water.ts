// Ocean / river / pond water. One camera-centred polar-grid mesh at sea level covers the sea, the channel and the
// river (the terrain is carved below sea level there); ponds get small discs at their own level.
//
// The material is a MeshStandardMaterial extended through onBeforeCompile so the surface gets three's IBL
// reflections (sky + clouds from the PMREM), GGX sun glints with cascaded shadows, and the global height fog for
// free. Added on top: Gerstner waves (attenuated near shore / in rivers), flow-mapped detail normals (rivers
// flow downstream), depth-based absorption color and transparency from the terrain height texture, shoreline
// foam, rain ripples and an underwater fog when the camera dives.
import * as THREE from 'three';
import type { World } from '../World';
import { WATER_RES, WORLD_SIZE } from '../terrain/TerrainData';
import { waveHeight, wavesGlsl } from './waves';
import { pondReach } from '../layout/pondShape';

export interface WaterUniforms {
  uTime: { value: number };
  uWaveAmp: { value: number };
  tWaterData: { value: THREE.Texture };
  tWaterNormal: { value: THREE.Texture };
  tNoise: { value: THREE.Texture };
  uWaterLevel: { value: number };
  uShallow: { value: THREE.Color };
  uDeep: { value: THREE.Color };
  uRain: { value: number };
  uWind: { value: number };
  uUseData: { value: number };
}

const vertPars = /* glsl */ `
uniform float uTime;
uniform float uWaveAmp;
uniform float uWaterLevel;
uniform sampler2D tWaterData;
uniform float uUseData;
varying vec3 vWPos;
varying float vShoreDist;
${wavesGlsl()}
`;

const vertBegin = /* glsl */ `
vec4 wpBase = modelMatrix * vec4( position, 1.0 );
vec2 wuv = clamp( wpBase.xz / ${WORLD_SIZE.toFixed(1)}, 0.0, 1.0 );
vec4 wd = uUseData > 0.5 ? texture2D( tWaterData, wuv ) : vec4( -50.0, 2000.0, 0.0, 0.0 );
// beyond the map square the clamped edge texels would smear into bands: keep the sea floor sloping down
// (absorption saturates within ~250 m) and the shore receding
float wOutV = max( 0.0, max( max( - wpBase.x, wpBase.x - ${WORLD_SIZE.toFixed(1)} ), max( - wpBase.z, wpBase.z - ${WORLD_SIZE.toFixed(1)} ) ) );
wd.rg += vec2( - 0.1, 1.0 ) * wOutV;
wd.ba *= 1.0 - step( 0.01, wOutV );
// open water gets full waves, rivers/near-shore calm down
float shoreAtt = smoothstep( 4.0, 140.0, wd.g ) * uWaveAmp;
vShoreDist = wd.g;
vec3 wOff, wNrm;
wavesAt( wpBase.xz, uTime, shoreAtt, wOff, wNrm );
vec3 objectNormal = wNrm;
`;

const fragPars = /* glsl */ `
uniform float uTime;
uniform float uWaterLevel;
uniform sampler2D tWaterData;
uniform sampler2D tWaterNormal;
uniform sampler2D tNoise;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uRain;
uniform float uWind;
uniform float uUseData;
varying vec3 vWPos;
varying float vShoreDist;

vec3 sampleDetail( vec2 p, vec2 flow, float t ) {
  // two-phase flow mapping (no stretching) for rivers; open sea uses wind drift
  float ph0 = fract( t * 0.35 ), ph1 = fract( t * 0.35 + 0.5 );
  float blend = abs( 1.0 - 2.0 * ph0 );
  vec2 drift = vec2( 0.012, 0.008 ) * t * ( 0.5 + uWind * 0.1 );
  vec2 f = flow * 1.2;
  vec3 n0 = texture2D( tWaterNormal, p / 7.0 - f * ph0 + drift ).xyz * 2.0 - 1.0;
  vec3 n1 = texture2D( tWaterNormal, p / 7.0 - f * ph1 + drift + 0.5 ).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D( tWaterNormal, p / 23.0 - drift * 0.6 - f * ph0 * 0.3 ).xyz * 2.0 - 1.0;
  vec3 n = mix( n0, n1, blend ) + n2 * 0.8;
  return n;
}
`;

const fragMap = /* glsl */ `
vec2 wuvF = clamp( vWPos.xz / ${WORLD_SIZE.toFixed(1)}, 0.0, 1.0 );
// ponds (uUseData = 0) only use the terrain height (depth); shore distance / flow are sea + river data
vec4 wdF = texture2D( tWaterData, wuvF );
if ( uUseData < 0.5 ) wdF.gba = vec3( 50.0, 0.0, 0.0 );
float wOutF = max( 0.0, max( max( - vWPos.x, vWPos.x - ${WORLD_SIZE.toFixed(1)} ), max( - vWPos.z, vWPos.z - ${WORLD_SIZE.toFixed(1)} ) ) ) * uUseData;
wdF.rg += vec2( - 0.1, 1.0 ) * wOutF;
wdF.ba *= 1.0 - step( 0.01, wOutF );
// The sea plane runs under the whole island; far away the depth buffer cannot separate it from low land
// (z-fighting), so drop water fragments where the terrain is clearly above the water surface. The margin
// shrinks with distance (bed is a 4 m bilinear height, exact enough once a pixel covers metres).
if ( wdF.r > vWPos.y + mix( 6.0, 0.25, smoothstep( 250.0, 1000.0, length( vWPos - cameraPosition ) ) ) ) discard;
float wDepth = max( uWaterLevel - wdF.r, 0.0 );
vec2 wFlow = wdF.ba;
// fresh water (river with flow, ponds) is darker and greener than the sea
float wIsRiver = step( 0.05, length( wFlow ) ) + ( 1.0 - step( 0.5, uUseData ) );
float wFresh = clamp( smoothstep( 0.02, 0.2, length( wFlow ) ) + 1.0 - step( 0.5, uUseData ), 0.0, 1.0 );
// absorption: shallow water shows the bed, deep water turns dark blue-green
float wAbs = 1.0 - exp( - wDepth * 0.3 );
vec3 wCol = mix( mix( uShallow, vec3( 0.035, 0.068, 0.05 ), wFresh ), mix( uDeep, vec3( 0.006, 0.02, 0.018 ), wFresh ), wAbs );
float wAlpha = clamp( 1.0 - exp( - wDepth * 0.9 ), 0.0, 1.0 );
// shoreline foam and wave-crest foam
float wFoamN = texture2D( tNoise, vWPos.xz / 9.0 + vec2( uTime * 0.03, uTime * 0.02 ) ).a;
// surf foam on sea coasts (stronger with wind), only a faint lap line on rivers/ponds
float wSurf = mix( clamp( 0.3 + uWind * 0.06, 0.0, 0.85 ), 0.12, clamp( wIsRiver, 0.0, 1.0 ) );
float wShore = smoothstep( 0.45, 0.04, wDepth ) * smoothstep( 0.35, 0.7, wFoamN + 0.25 * sin( uTime * 1.6 - wDepth * 9.0 ) ) * wSurf;
// whitecaps: small broken patches on the highest crests, only with real wind (none in calm/clear weather)
float wCrestN = texture2D( tNoise, vWPos.xz / 3.7 + vec2( uTime * 0.05, - uTime * 0.03 ) ).a;
float wCrest = smoothstep( 0.22, 0.45, vWPos.y - uWaterLevel ) * smoothstep( 0.62, 0.8, wCrestN ) * smoothstep( 3.5, 9.0, uWind );
float wFoam = clamp( wShore + wCrest * 0.6, 0.0, 1.0 ) * mix( 1.0, 0.35, smoothstep( 150.0, 900.0, length( vWPos - cameraPosition ) ) );
diffuseColor.rgb = mix( wCol, vec3( 0.75, 0.78, 0.78 ), wFoam );
diffuseColor.a = max( wAlpha, wFoam * 0.9 );
`;

const fragNormal = /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
vec3 wDet = sampleDetail( vWPos.xz, wFlow, uTime );
// rain ripples
if ( uRain > 0.01 ) {
  vec2 rp = vWPos.xz * 1.7;
  float r1 = texture2D( tNoise, rp + uTime * vec2( 0.31, 0.17 ) ).b - 0.5;
  float r2 = texture2D( tNoise, rp * 1.3 - uTime * vec2( 0.23, 0.29 ) ).b - 0.5;
  wDet.xy += vec2( r1, r2 ) * uRain * 0.9;
}
vec3 wN = normalize( vNormal ); // view-space wave normal
vec3 wNw = normalize( ( vec4( wN, 0.0 ) * viewMatrix ).xyz );
float wDetStr = 0.35 * mix( 0.45, 1.0, smoothstep( 2.0, 60.0, vShoreDist ) ) * ( 1.0 - smoothstep( 80.0, 900.0, length( vWPos - cameraPosition ) ) * 0.7 );
vec3 wNfinal = normalize( wNw + vec3( wDet.x, 0.0, wDet.y ) * wDetStr );
wNfinal *= faceDirection;
vec3 normal = normalize( ( viewMatrix * vec4( wNfinal, 0.0 ) ).xyz );
vec3 nonPerturbedNormal = normal;
`;

export function createWaterMaterial(u: WaterUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    envMapIntensity: 0.8,
  });
  m.name = 'water';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertPars)
      .replace('#include <beginnormal_vertex>', vertBegin)
      .replace('#include <begin_vertex>', 'vec3 transformed = position + wOff; // model matrices are translation-only')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fragPars)
      .replace('#include <map_fragment>', fragMap)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( roughness, 0.6, wFoam ) + uRain * 0.05;')
      .replace('#include <normal_fragment_begin>', fragNormal);
  };
  m.customProgramCacheKey = () => 'water-v1';
  return m;
}

/** Camera-centred polar grid: dense near the center, reaching ~14 km. */
function createOceanGeometry(rings = 110, segments = 192, radius = 14000): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  for (let r = 1; r <= rings; r++) {
    const rad = radius * Math.pow(r / rings, 2.7);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segments, b0 = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      idx.push(a0 + s, a0 + s1, b0 + s, b0 + s, a0 + s1, b0 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  return g;
}

export class Water {
  readonly ocean: THREE.Mesh;
  readonly ponds: THREE.Mesh[] = [];
  readonly uniforms: WaterUniforms;
  readonly pondUniforms: WaterUniforms[] = [];
  private shoreDist: Float32Array;
  /** 0..1 global wave strength (weather). */
  waveStrength = 1;

  constructor(
    private readonly world: World,
    dataTex: THREE.Texture,
    normalTex: THREE.Texture,
    noise: THREE.Texture,
  ) {
    this.uniforms = {
      uTime: { value: 0 },
      uWaveAmp: { value: 1 },
      tWaterData: { value: dataTex },
      tWaterNormal: { value: normalTex },
      tNoise: { value: noise },
      uWaterLevel: { value: world.seaLevel },
      // cold northern sea: dark blue-green, a muted teal only over shallow sand
      uShallow: { value: new THREE.Color(0.05, 0.14, 0.135) },
      uDeep: { value: new THREE.Color(0.004, 0.026, 0.042) },
      uRain: { value: 0 },
      uWind: { value: 3 },
      uUseData: { value: 1 },
    };
    this.ocean = new THREE.Mesh(createOceanGeometry(), createWaterMaterial(this.uniforms));
    this.ocean.name = 'ocean';
    this.ocean.frustumCulled = false;
    this.ocean.receiveShadow = true;
    this.ocean.renderOrder = 1;
    // CPU copy of the shore distance (for getWaterHeight wave attenuation)
    const d = world.terrain.water;
    this.shoreDist = new Float32Array(WATER_RES * WATER_RES);
    for (let i = 0; i < this.shoreDist.length; i++) this.shoreDist[i] = THREE.DataUtils.fromHalfFloat(d[i * 4 + 1]);
    // ponds: flat discs at their own level
    world.layout.ponds.forEach((p) => {
      const u: WaterUniforms = { ...this.uniforms, uWaterLevel: { value: p.level }, uWaveAmp: { value: 0 }, uUseData: { value: 0 } };
      this.pondUniforms.push(u);
      const geo = new THREE.CircleGeometry(pondReach(p) + 2, 64).rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, createWaterMaterial(u));
      mesh.position.set(p.x, p.level, p.z);
      mesh.name = 'pond';
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      this.ponds.push(mesh);
    });
    world.waveHeight = (x, z) => this.waveAt(x, z);
  }

  private shoreAt(x: number, z: number): number {
    const R = WATER_RES, texel = WORLD_SIZE / R;
    const gx = Math.min(R - 1.001, Math.max(0, x / texel - 0.5)), gz = Math.min(R - 1.001, Math.max(0, z / texel - 0.5));
    const i = gx | 0, j = gz | 0, tx = gx - i, tz = gz - j;
    const s = this.shoreDist, o = j * R + i;
    return (s[o] * (1 - tx) + s[o + 1] * tx) * (1 - tz) + (s[o + R] * (1 - tx) + s[o + R + 1] * tx) * tz;
  }

  /** Wave displacement (m) at a point, matching the shader (vertical component). */
  waveAt(x: number, z: number): number {
    const sd = x < 0 || z < 0 || x > WORLD_SIZE || z > WORLD_SIZE ? 2000 : this.shoreAt(x, z);
    const t = THREE.MathUtils.smoothstep(sd, 4, 140) * this.uniforms.uWaveAmp.value;
    return waveHeight(x, z, this.uniforms.uTime.value, t);
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.ocean, ...this.ponds);
  }

  update(dt: number, camera: THREE.Camera, rain: number, wind: number): void {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uWaveAmp.value = THREE.MathUtils.clamp(0.55 + wind * 0.08, 0.4, 1.4) * this.waveStrength;
    u.uRain.value = rain;
    u.uWind.value = wind;
    for (const pu of this.pondUniforms) {
      pu.uTime.value = u.uTime.value;
      pu.uRain.value = rain;
    }
    // follow the camera, snapped so vertices don't swim
    const snap = 8;
    this.ocean.position.set(Math.round(camera.position.x / snap) * snap, this.world.seaLevel, Math.round(camera.position.z / snap) * snap);
  }

  /** True when the camera is below the water surface. */
  isUnderwater(p: THREE.Vector3): boolean {
    const w = this.world.getWaterHeight(p.x, p.z);
    return w !== null && p.y < w - 0.05;
  }
}
