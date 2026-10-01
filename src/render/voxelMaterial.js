// Material for voxel props (dumpsters, bins, poles, fire escapes, debris, the
// player's body...). Per-vertex palette colour + per-voxel variation, material
// classes (painted metal with rust, galvanized, wood, cardboard, plastic bags,
// glass, fabric, leather, sheer nylon...), wetness, baked irradiance + AO.
import * as THREE from 'three';
import { GLSL_COMMON, shared, patch } from './shaderlib.js';

export const MCLS = {
  GENERIC: 0,
  METAL_PAINTED: 1,
  RUST: 2,
  GALV: 3,
  WOOD: 4,
  PLASTIC: 5,
  CARDBOARD: 6,
  FABRIC: 7,
  GLASS: 8,
  CONCRETE: 9,
  BRICK: 10,
  EMISSIVE: 11,
  SKIN: 12,
  LEATHER: 13,
  NYLON: 14,
  PAPER: 15,
  RUBBER: 16,
  TRASHBAG: 17,
  ORGANIC: 18,
  WIRE: 19,
};

export function createVoxelMaterial(opts = {}) {
  const uniforms = {
    uEmissive: { value: opts.emissive ?? 0 },
    uEmissiveColor: { value: new THREE.Color(opts.emissiveColor ?? 0xffc080) },
    uWetScale: { value: opts.wetScale ?? 1 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0,
    side: opts.side ?? THREE.FrontSide,
  });
  mat.name = opts.name ?? 'voxel';
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, uniforms);
    let vs = shader.vertexShader;
    vs = patch(vs, '#include <common>', /* glsl */ `
      attribute vec4 vcol;
      attribute vec4 vmat;
      attribute vec3 vox;
      varying vec4 vCol;
      varying vec4 vMat;
      varying vec3 vVox;
      varying vec3 vWPos;
      varying vec3 vWNrm;
      varying vec3 vONrm;
    `, 'after');
    vs = patch(vs, '#include <skinning_vertex>', /* glsl */ `
      vCol = vcol; vMat = vmat; vVox = vox;
      vec4 wp4 = vec4(transformed, 1.0);
      vec3 wn3 = objectNormal;
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix * wp4;
        wn3 = mat3(instanceMatrix) * wn3;
      #endif
      vWPos = (modelMatrix * wp4).xyz;
      vWNrm = normalize(mat3(modelMatrix) * wn3);
      vONrm = normal;
    `, 'after');
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = patch(fs, '#include <common>', GLSL_COMMON + VOXEL_PARS, 'after');
    fs = patch(fs, '#include <map_fragment>', VOXEL_SURFACE);
    fs = patch(fs, '#include <roughnessmap_fragment>', 'float roughnessFactor = sRough;');
    fs = patch(fs, '#include <metalnessmap_fragment>', 'float metalnessFactor = sMetal;');
    fs = patch(fs, '#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(sN, 0.0)).xyz);');
    fs = patch(fs, '#include <emissivemap_fragment>', 'totalEmissiveRadiance += sEmit;', 'after');
    fs = patch(fs, '#include <lights_fragment_maps>', /* glsl */ `
      irradiance = sampleIrradiance(vWPos, sN) * sAO + sSSS;
      #if defined( USE_ENVMAP )
        iblIrradiance = vec3(0.0);
        radiance *= sSpecOcc;
      #endif
    `, 'after');
    fs = patch(fs, '#include <aomap_fragment>', /* glsl */ `
      float pShadow = playerShadow(vWPos + sN * 0.02);
      reflectedLight.directDiffuse *= pShadow;
      reflectedLight.directSpecular *= pShadow;
    `, 'before');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'voxel-v1';
  return mat;
}

const VOXEL_PARS = /* glsl */ `
uniform float uEmissive;
uniform vec3 uEmissiveColor;
uniform float uWetScale;
varying vec4 vCol;
varying vec4 vMat;
varying vec3 vVox;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vONrm;
`;

const VOXEL_SURFACE = /* glsl */ `
  int cls = int(vMat.b * 255.0 + 0.5);
  ivec3 vc = ivec3(floor(vVox));
  vec3 hv = h33(vc);
  vec3 base = srgbToLinear(vCol.rgb);
  float vari = vCol.a;
  vec3 alb = base * (1.0 + vari * (hv.x * 2.0 - 1.0));
  float rough = vMat.r;
  float metal = vMat.g;
  float porosity = 0.5;
  vec3 sN = normalize(vWNrm);
  vec3 sEmit = vec3(0.0);
  vec3 sSSS = vec3(0.0);
  // coarse-scale noise in voxel space for patterns spanning several voxels
  float nBig = noise3L(vVox * 0.21 + vec3(vc.x / 997));
  float nMid = noise3L(vVox * 0.55 + 7.3);

  if (cls == 1) {
    // painted metal: chips and rust bleeding through
    float rust = smoothstep(0.58, 0.74, nBig * 0.75 + nMid * 0.25 + hv.y * 0.12);
    vec3 rc = mix(vec3(0.13, 0.055, 0.025), vec3(0.24, 0.1, 0.04), hv.z);
    alb = mix(alb, rc, rust);
    rough = mix(rough, 0.92, rust);
    metal = mix(metal, 0.0, rust);
    porosity = 0.15;
  } else if (cls == 2) {
    vec3 rc = mix(vec3(0.09, 0.04, 0.02), vec3(0.26, 0.11, 0.04), smoothstep(0.2, 0.8, nMid * 0.7 + hv.y * 0.3));
    alb = mix(alb, rc, 0.75);
    rough = 0.9;
    metal = 0.15;
    porosity = 0.3;
  } else if (cls == 3) {
    float sp = smoothstep(0.55, 0.8, nMid + hv.y * 0.2);
    alb = mix(alb, alb * vec3(0.75, 0.74, 0.72), sp) * (0.85 + 0.3 * nBig);
    rough = mix(0.35, 0.75, sp);
    metal = mix(0.85, 0.4, sp);
    porosity = 0.05;
  } else if (cls == 4) {
    float grain = noise3L(vec3(vVox.x * 0.15, vVox.y * 2.5, vVox.z * 0.15) + 3.0);
    alb *= 0.8 + 0.35 * grain;
    porosity = 0.9;
  } else if (cls == 5) {
    porosity = 0.0;
  } else if (cls == 6) {
    alb *= 0.85 + 0.3 * nMid;
    porosity = 1.0;
  } else if (cls == 8) {
    rough = 0.06;
    porosity = 0.0;
    sSSS = base * 0.12 * skyVisibility(vWPos, sN);
  } else if (cls == 11) {
    sEmit = base * uEmissiveColor * uEmissive;
    porosity = 0.0;
  } else if (cls == 12) {
    sSSS = base * vec3(0.25, 0.08, 0.05) * 0.4;
    porosity = 0.0;
  } else if (cls == 13) {
    // leather: glossy with creased variation
    rough = mix(0.22, 0.42, hv.y);
    porosity = 0.05;
  } else if (cls == 14) {
    // sheer black nylon over skin: skin shows where the fabric faces the eye
    vec3 V = normalize(cameraPosition - vWPos);
    float facing = clamp(dot(sN, V), 0.0, 1.0);
    vec3 skin = vec3(0.32, 0.2, 0.16);
    alb = mix(vec3(0.012, 0.011, 0.012), skin * 0.32, pow(facing, 2.5));
    rough = 0.48;
    porosity = 0.0;
  } else if (cls == 15) {
    porosity = 1.0;
    alb *= 0.9 + 0.2 * nMid;
  } else if (cls == 17) {
    // black trash bags: glossy, crinkled
    rough = mix(0.18, 0.4, hv.y);
    alb *= 0.8 + 0.4 * hv.z;
    porosity = 0.0;
  } else if (cls == 9) {
    alb *= 0.88 + 0.24 * nMid;
    porosity = 0.9;
  } else if (cls == 16) {
    porosity = 0.1;
  }

  // nothing in an alley stays white: soft-knee the albedo above ~0.28 (linear)
  {
    float aL = dot(alb, vec3(0.2126, 0.7152, 0.0722));
    alb *= (aL < 0.28 ? aL : 0.28 + (aL - 0.28) * 0.4) / max(aL, 1e-4);
  }

  // wetness: up-facing surfaces hold water, everything is a little damp
  float up = smoothstep(0.35, 0.85, sN.y);
  float wet = uWetness * uWetScale * clamp(0.25 + 0.75 * up, 0.0, 1.0);
  alb *= mix(1.0, 0.6, wet * porosity);
  rough = mix(rough, min(rough, 0.18 + 0.2 * hv.z), wet * mix(0.35, 1.0, up) * (1.0 - porosity * 0.4));

  float sAO = vMat.a;
  float sSpecOcc = sAO * clamp(skyVisibility(vWPos, sN) * 1.5, 0.12, 1.0);
  float sRough = clamp(rough, 0.04, 1.0);
  float sMetal = metal;
  diffuseColor.rgb = alb;
`;
