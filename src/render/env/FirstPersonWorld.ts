// First-person additions to the gameplay layer.
//
// From the hunter's eyes the floe must read as a solid slab floating in an
// open sea, so first person swaps in / adds:
//  * an extended floe outline: the left end continues ~40 m past the classic
//    x = -30 cut into a jagged tongue, so the spawn area (x ~ -22) is not right
//    in front of a hard edge and creatures come out of the misty distance
//    (gameplay limits are unchanged: they live in config/constants),
//  * a signed distance map of that outline (foam line on the sea, snowy lip on
//    the ice),
//  * a sea plane at WATER_LEVEL out to the horizon: fresnel reflection of the
//    first-person backdrop cube, small animated waves, submerged-ice glow and
//    broken foam along the cliffs, fog,
//  * fogged cliff walls with a snow cap,
//  * a few small floes drifting in the sea around the big one.
import * as THREE from 'three';
import { FLOE_BACK, FLOE_FRONT, FLOE_TOP_Y, WATER_LEVEL, floeEdgeDistance, type XZ } from '../../config/field';
import { NOISE_GLSL } from './glsl';
import { mulberry32 } from './noise';

/**
 * The left tongue of the first-person floe, from the classic back-left corner
 * (-30, -18.27) round to the front-left corner (-30, 12.9), counter-clockwise.
 */
const LEFT_TONGUE: XZ[] = [
  [-34.6, -18.9],
  [-40.2, -18.1],
  [-46.8, -19.4],
  [-52.5, -17.6],
  [-58.9, -16.5],
  [-63.2, -13.2],
  [-67.8, -11.6],
  [-69.6, -6.4],
  [-72.1, -1.8],
  [-70.4, 3.1],
  [-68.6, 7.4],
  [-63.9, 9.6],
  [-58.2, 12.4],
  [-51.3, 13.5],
  [-45.6, 12.6],
  [-39.8, 14.0],
  [-34.4, 13.3],
];

/** Closed outline of the first-person floe top (CCW from above, like FLOE_OUTLINE). */
export const FP_FLOE_OUTLINE: XZ[] = [...FLOE_FRONT, ...FLOE_BACK.slice().reverse(), ...LEFT_TONGUE];

/** World rect covered by the distance map (minX, minZ, sizeX, sizeZ). */
export const SDF_RECT = new THREE.Vector4(-80, -28, 120, 52);
/** Distance range stored in the map: +-SDF_RANGE m around 0.5. */
export const SDF_RANGE = 8;

/**
 * Signed distance to the first-person floe outline (m, positive on the ice) as
 * an 8-bit texture: value = 0.5 + d / (2 * SDF_RANGE).
 */
export function buildFloeSdfTexture(outline: XZ[] = FP_FLOE_OUTLINE, texel = 0.2): THREE.DataTexture {
  const w = Math.round(SDF_RECT.z / texel);
  const h = Math.round(SDF_RECT.w / texel);
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const z = SDF_RECT.y + (j + 0.5) * texel;
    for (let i = 0; i < w; i++) {
      const x = SDF_RECT.x + (i + 0.5) * texel;
      const d = floeEdgeDistance(x, z, outline);
      data[j * w + i] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + d / (2 * SDF_RANGE))));
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  tex.name = 'FloeSDF';
  return tex;
}

/** Fog uniforms for our ShaderMaterials (filled by three.js from scene.fog when `fog: true`). */
function fogUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
}

const FOG_VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/**
 * Sea around the floe. The mesh is a big square that follows the camera in
 * x/z (shading is anchored to world coordinates, so nothing swims).
 */
export function createFirstPersonSea(envCube: THREE.CubeTexture, envLod: number, sdf: THREE.Texture): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(7000, 7000);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    name: 'FirstPersonSea',
    fog: true,
    uniforms: {
      ...fogUniforms(),
      uTime: { value: 0 },
      uEnvCube: { value: envCube },
      uEnvLod: { value: envLod },
      uSdf: { value: sdf },
      uSdfRect: { value: SDF_RECT.clone() },
      uDeep: { value: new THREE.Vector3(0.045, 0.065, 0.11) },
      uShelf: { value: new THREE.Vector3(0.1, 0.26, 0.34) },
      uFoam: { value: new THREE.Vector3(0.62, 0.68, 0.8) },
    },
    vertexShader: FOG_VERT,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uEnvLod;
      uniform samplerCube uEnvCube;
      uniform sampler2D uSdf;
      uniform vec4 uSdfRect;
      uniform vec3 uDeep, uShelf, uFoam;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec3 toEye = cameraPosition - vWorld;
        float dist = length(toEye);
        vec3 V = toEye / dist;
        vec2 p = vWorld.xz;
        // Two drifting octaves of swell + chop (height gradients), calmer far away.
        vec3 w1 = envNoiseD(p * vec2(0.16, 0.22) + vec2(uTime * 0.05, uTime * 0.035));
        vec3 w2 = envNoiseD(ENV_ROT * p * 0.75 - vec2(uTime * 0.11, -uTime * 0.07));
        vec3 w3 = envNoiseD(p * 2.3 + vec2(uTime * 0.31, uTime * 0.17));
        // Fade each octave out before it gets smaller than a pixel (no glitter far away).
        float fw = length(fwidth(p));
        float k2 = smoothstep(1.0, 0.25, fw * 0.75);
        float k3 = smoothstep(0.5, 0.1, fw * 2.3);
        vec2 g = w1.yz * 0.16 * 0.3 + w2.yz * 0.75 * 0.09 * k2 + w3.yz * 2.3 * 0.012 * k3;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 sky = textureLod(uEnvCube, R, uEnvLod + 0.8).rgb;
        // Distance to the big floe (m, negative = out in the water).
        vec2 sUv = (vWorld.xz - uSdfRect.xy) / uSdfRect.zw;
        float inRect = step(0.0, sUv.x) * step(sUv.x, 1.0) * step(0.0, sUv.y) * step(sUv.y, 1.0);
        float d = mix(-8.0, (texture2D(uSdf, clamp(sUv, 0.0, 1.0)).r - 0.5) * 16.0, inRect);
        float out_ = max(-d, 0.0);
        // Body colour: deep blue-grey, turquoise over the submerged ice foot.
        vec3 water = uDeep * (0.85 + 0.3 * w1.x);
        water = mix(water, uShelf, 0.75 * exp(-out_ / 2.2));
        vec3 c = mix(water, sky, fres);
        // Broken foam hugging the cliffs.
        float fn = envNoise(p * vec2(1.3, 1.1) + vec2(uTime * 0.2, 0.0)) * 0.6 + w3.x * 0.4;
        float foam = smoothstep(0.75, 0.0, out_ + (fn - 0.5) * 0.9) * (0.55 + 0.45 * fn);
        foam += 0.35 * smoothstep(2.2, 0.8, out_ + (fn - 0.5) * 1.6) * smoothstep(0.55, 0.75, fn);
        c = mix(c, uFoam, clamp(foam, 0.0, 1.0) * 0.85);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'FirstPersonSea';
  m.position.y = WATER_LEVEL;
  m.frustumCulled = false;
  return m;
}

/**
 * Cliff walls in first person: the classic palette (pale faces towards the
 * light on the left, darker faces to the right), lit from the sun's side, a
 * snow cap along the top, wet and darker towards the waterline, fogged.
 */
export function createFirstPersonCliffMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'FirstPersonCliff',
    fog: true,
    uniforms: {
      ...fogUniforms(),
      uLight: { value: new THREE.Vector3(0.5, 0.74, 1.15) },
      uDark: { value: new THREE.Vector3(0.12, 0.17, 0.25) },
      uSnow: { value: new THREE.Vector3(0.62, 0.66, 0.76) },
      uTop: { value: FLOE_TOP_Y },
      uWater: { value: WATER_LEVEL },
    },
    vertexShader: FOG_VERT,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uLight, uDark, uSnow;
      uniform float uTop, uWater;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(vNormal);
        // Faces turned to the sun (upper left, behind the floe) are pale.
        float k = smoothstep(-0.35, 0.75, dot(n.xz, normalize(vec2(-0.5, -0.35))));
        vec2 t = normalize(vec2(-n.z, n.x));
        float s = dot(vWorld.xz, t);
        float streak = envFbm3(vec2(s * 0.16, vWorld.y * 2.6));
        float blob = envFbm3(vec2(s * 0.09 + 4.0, vWorld.y * 0.7));
        vec3 c = mix(uDark, uLight, 0.25 + 0.75 * k);
        c *= 0.78 + 0.42 * streak;
        c *= 0.8 + 0.4 * smoothstep(0.25, 0.75, blob);
        // Wet, darker band just above the sea; snow cap along the top edge.
        c *= 1.0 - 0.35 * smoothstep(uWater + 0.9, uWater, vWorld.y);
        float cap = smoothstep(uTop - 0.22 - 0.12 * blob, uTop - 0.04, vWorld.y);
        c = mix(c, uSnow, cap);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

/** Small floes around the big one: (centre x, z, radius m, height above the sea m). */
const SMALL_FLOES: Array<[number, number, number, number]> = [
  [-12, -36, 4.5, 0.7],
  [22, -50, 9, 1.1],
  [-38, -66, 13, 1.5],
  [58, -36, 7, 0.8],
  [-6, 34, 5.5, 0.6],
  [31, 47, 10, 1.2],
  [-44, 58, 8, 0.9],
  [52, 8, 6.5, 0.8],
  [78, -14, 14, 1.6],
  [-96, 22, 11, 1.1],
  [-88, -38, 7, 0.9],
  [8, 92, 16, 1.4],
  [-20, -120, 18, 1.8],
];

/** Low irregular ice slabs with a pale top and blue sides (standard material: lit, shadowed, fogged). */
export function createSmallFloes(): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const top = new THREE.Color(0.66, 0.71, 0.8);
  const side = new THREE.Color(0.34, 0.48, 0.68);
  const rnd = mulberry32(4242);
  for (const [cx, cz, r, h] of SMALL_FLOES) {
    const n = 9 + Math.floor(rnd() * 5);
    const ring: Array<[number, number]> = [];
    const phase = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
      const rr = r * (0.7 + 0.45 * rnd());
      ring.push([cx + Math.cos(a) * rr * 1.25, cz + Math.sin(a) * rr * 0.85]);
    }
    const yTop = WATER_LEVEL + h;
    const yBot = WATER_LEVEL - 1.2;
    // Top: fan around the centre (counter-clockwise from above = up-facing).
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      // Ring runs with increasing angle in x/z, which is clockwise seen from +y: emit (c, b, a).
      pos.push(cx, yTop, cz, b[0], yTop, b[1], a[0], yTop, a[1]);
      for (let k = 0; k < 3; k++) col.push(top.r, top.g, top.b);
      // Wall a -> b, outward facing.
      pos.push(a[0], yTop, a[1], b[0], yTop, b[1], a[0], yBot, a[1]);
      pos.push(b[0], yTop, b[1], b[0], yBot, b[1], a[0], yBot, a[1]);
      for (let k = 0; k < 6; k++) col.push(side.r, side.g, side.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, flatShading: true });
  mat.name = 'SmallFloes';
  const m = new THREE.Mesh(g, mat);
  m.name = 'SmallFloes';
  m.receiveShadow = false;
  return m;
}
