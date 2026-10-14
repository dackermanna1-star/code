// The pier deck: real board geometry (planks running across the pier, i.e.
// along z, split at staggered butt joints over the joists, slightly uneven,
// ragged ends at the edges, a few broken pieces out of the lanes) and a
// MeshStandardMaterial extended with procedural weathered wood:
//  * per-board colour (silver-grey weathered, warm brown, dark wet, fresh
//    replacement boards, a few with old blue paint), grain + cathedral figure
//    running along the board, knots, worn edges, bevelled seams;
//  * rust spots + streaks at the nails on every joist line;
//  * water stains, salt, algae near the edges, puddles (wet = dark + glossy);
//  * the blood / scorch decal map (premultiplied RGBA, DECAL_RECT): soaks along
//    the grain, pools darker in the seams, stays glossy-wet.
import * as THREE from 'three';
import { DECAL_RECT, PIER } from '../../config/world';
import { NOISE_GLSL, dirSpecularScaledLightsChunk } from './glsl';
import { mulberry32 } from './noise';

export const BOARD_W = 0.235;
export const BOARD_GAP = 0.016;
export const BOARD_PITCH = BOARD_W + BOARD_GAP;
export const BOARD_T = 0.055;
/** Joist lines (z) under the boards: nails and butt joints sit on these. */
export const JOISTS = [-5.85, -4.4, -2.95, -1.5, 0, 1.5, 2.95, 4.4, 5.85];
/** The deck starts a little left of PIER.minX (the promenade end is off-screen). */
export const DECK_X0 = PIER.minX - 4;

export interface DeckUniforms {
  uDecalMap: { value: THREE.Texture | null };
  uDecalRect: { value: THREE.Vector4 };
  uDecalTexel: { value: THREE.Vector2 };
  uWetness: { value: number };
  uTime: { value: number };
  /** Key-light specular scale on the planks (wet sheen without mirror glare). */
  uDeckDirSpec: { value: number };
  /** Sky (environment map) reflection kept in puddles (1 = all; lowered at night). */
  uPudEnv: { value: number };
  /** Planar reflection of REFLECT_LAYER objects (characters, corpses, effects) in wet spots. */
  uReflMap: { value: THREE.Texture | null };
  uReflMatrix: { value: THREE.Matrix4 };
  uReflStrength: { value: number };
  uReflTexel: { value: THREE.Vector2 };
}

export interface DeckHole {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Build the board geometry. Returns the geometry and the broken spots (for debris dressing). */
export function buildDeckGeometry(seed = 4242): { geo: THREE.BufferGeometry; holes: DeckHole[] } {
  const rnd = mulberry32(seed);
  const pos: number[] = [];
  const nor: number[] = [];
  const board: number[] = [];
  const holes: DeckHole[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], info: number[]) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0], v[1], v[2]);
      nor.push(n[0], n[1], n[2]);
      board.push(info[0], info[1], info[2], info[3]);
    }
  };
  const piece = (x0: number, x1: number, z0: number, z1: number, info: number[]) => {
    const top = (rnd() - 0.5) * 0.008;
    const tilt = (rnd() - 0.5) * 0.006;
    const yA = top - tilt;
    const yB = top + tilt;
    const yb = -BOARD_T;
    // top (y up); slight tilt across the board
    quad([x0, yA, z1], [x1, yB, z1], [x1, yB, z0], [x0, yA, z0], [0, 1, 0], info);
    // +z end, -z end
    quad([x0, yb, z1], [x1, yb, z1], [x1, yB, z1], [x0, yA, z1], [0, 0, 1], info);
    quad([x1, yb, z0], [x0, yb, z0], [x0, yA, z0], [x1, yB, z0], [0, 0, -1], info);
    // ±x sides
    quad([x1, yb, z1], [x1, yb, z0], [x1, yB, z0], [x1, yB, z1], [1, 0, 0], info);
    quad([x0, yb, z0], [x0, yb, z1], [x0, yA, z1], [x0, yA, z0], [-1, 0, 0], info);
  };
  const n = Math.ceil((PIER.maxX - DECK_X0) / BOARD_PITCH);
  let lastJoint = -1;
  for (let i = 0; i < n; i++) {
    const x0 = DECK_X0 + i * BOARD_PITCH;
    const x1 = Math.min(PIER.maxX, x0 + BOARD_W);
    if (x1 - x0 < 0.05) break;
    const cx = (x0 + x1) / 2;
    // Butt joints at one or two joist lines, staggered from the previous row.
    const joints: number[] = [];
    let j1 = 2 + Math.floor(rnd() * 5);
    if (j1 === lastJoint) j1 = ((j1 + 2) % 5) + 2;
    lastJoint = j1;
    joints.push(JOISTS[j1]);
    if (rnd() < 0.35) {
      const j2 = j1 <= 3 ? j1 + 3 : j1 - 3;
      joints.push(JOISTS[Math.max(1, Math.min(7, j2))]);
    }
    joints.sort((a, b) => a - b);
    const zEdge0 = PIER.minZ - 0.04 - rnd() * 0.06;
    const zEdge1 = PIER.maxZ + 0.04 + rnd() * 0.06;
    const cuts = [zEdge0, ...joints, zEdge1];
    for (let k = 0; k < cuts.length - 1; k++) {
      let z0 = cuts[k] + (k > 0 ? 0.006 : 0);
      let z1 = cuts[k + 1] - (k < cuts.length - 2 ? 0.006 : 0);
      const seedB = rnd();
      // Broken / missing ends at the edges, outside the lanes.
      const edgePiece = k === 0 || k === cuts.length - 2;
      if (edgePiece && rnd() < 0.035 && cx > -24 && cx < 21) {
        const bite = 0.35 + rnd() * 0.55;
        if (k === 0) {
          holes.push({ x0, x1, z0, z1: z0 + bite });
          z0 += bite;
        } else {
          holes.push({ x0, x1, z0: z1 - bite, z1 });
          z1 -= bite;
        }
      }
      piece(x0, x1, z0, z1, [seedB, cx, z0, z1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aBoard', new THREE.Float32BufferAttribute(board, 4));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, holes };
}

export function createDeckUniforms(): DeckUniforms {
  return {
    uDecalMap: { value: null },
    uDecalRect: { value: new THREE.Vector4(DECAL_RECT.minX, DECAL_RECT.minZ, DECAL_RECT.sizeX, DECAL_RECT.sizeZ) },
    uDecalTexel: { value: new THREE.Vector2(1 / 2048, 1 / 512) },
    uWetness: { value: 0.5 },
    uTime: { value: 0 },
    uDeckDirSpec: { value: 0.4 },
    uPudEnv: { value: 1 },
    uReflMap: { value: null },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflStrength: { value: 0.5 },
    uReflTexel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
  };
}

const JOIST_GLSL = `const float JOISTS[9] = float[9](${JOISTS.map((z) => z.toFixed(3)).join(', ')});`;

export function createDeckMaterial(u: DeckUniforms, opts: { reflections?: boolean } = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, envMapIntensity: 1 });
  mat.name = 'DeckBoards';
  if (opts.reflections) mat.defines = { ...(mat.defines ?? {}), DECK_REFL: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aBoard;
        varying vec4 vBoard;
        varying vec3 vDeckWorld;
        varying vec3 vDeckNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vBoard = aBoard;
        vDeckWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vDeckNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec4 vBoard;
        varying vec3 vDeckWorld;
        varying vec3 vDeckNormal;
        uniform sampler2D uDecalMap;
        uniform vec4 uDecalRect;
        uniform vec2 uDecalTexel;
        uniform float uWetness, uTime, uDeckDirSpec, uPudEnv;
        #ifdef DECK_REFL
        uniform sampler2D uReflMap;
        uniform mat4 uReflMatrix;
        uniform float uReflStrength;
        uniform vec2 uReflTexel;
        #endif
        ${NOISE_GLSL}
        ${JOIST_GLSL}
        vec4 deckDecal(vec2 xz) {
          vec2 uv = (xz - uDecalRect.xy) / uDecalRect.zw;
          vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
          return texture2D(uDecalMap, clamp(uv, 0.0, 1.0)) * (inside.x * inside.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 dW = vDeckWorld;
        float bSeed = vBoard.x;
        float halfW = ${(BOARD_W / 2).toFixed(4)};
        float across = clamp((dW.x - vBoard.y) / halfW, -1.0, 1.0);
        float along = dW.z;
        float isTop = step(0.5, vDeckNormal.y);
        // --- grain & figure (running along the board, i.e. along z)
        float gA = envNoise(vec2(across * 1.3 + bSeed * 71.0, along * 0.55));
        float gB = envNoise(vec2(across * 7.0 + bSeed * 37.0, along * 2.6));
        float gC = envNoise(vec2(across * 22.0 + bSeed * 13.0, along * 0.9 + bSeed * 5.0));
        float fig = sin((across * 2.2 + (gA - 0.5) * 3.0 + along * 0.06 + bSeed * 9.0) * 6.2831 * 1.4);
        float grain = 0.5 + 0.22 * (gA - 0.5) * 2.0 + 0.16 * fig * (0.5 + gB) + 0.18 * (gC - 0.5) * 2.0;
        // --- board colour families
        vec3 cGrey = vec3(0.19, 0.165, 0.14);
        vec3 cBrown = vec3(0.2, 0.135, 0.085);
        vec3 cDark = vec3(0.075, 0.058, 0.045);
        vec3 cNew = vec3(0.42, 0.27, 0.14);
        vec3 cPaint = vec3(0.09, 0.16, 0.22);
        // (Board-to-board variety kept modest: strong value jumps between boards read as
        // shadow stripes and fight the characters for attention.)
        vec3 wood = mix(cGrey, cBrown, 0.25 + smoothstep(0.25, 0.75, fract(bSeed * 7.31)) * 0.45);
        wood = mix(wood, cDark, step(0.86, bSeed) * 0.38);
        wood = mix(wood, cNew, step(bSeed, 0.05) * 0.45);
        float painted = step(0.07, bSeed) * step(bSeed, 0.082);
        // Remnants of old paint, worn through along the middle (faded: it must not read as a shadow).
        float paintKeep = smoothstep(0.35, 0.65, envFbm3(vec2(across * 2.0, along * 1.4) + bSeed * 40.0) + abs(across) * 0.35);
        wood = mix(wood, cPaint, painted * paintKeep * 0.4);
        wood *= 0.82 + 0.36 * grain;
        // Knots.
        vec2 kc = vec2(across * 1.0, along * 0.8 + bSeed * 13.0);
        vec2 kcell = floor(kc);
        vec2 ko = envHash22(kcell + bSeed * 7.0);
        float knot = step(0.86, envHash12(kcell * 3.1 + bSeed)) * smoothstep(0.22, 0.05, length((fract(kc) - ko * 0.6 - 0.2) * vec2(1.0, 0.55)));
        wood *= 1.0 - 0.55 * knot;
        // --- weathering over the whole deck (world-anchored)
        vec2 wp = dW.xz;
        float stain = envFbm(wp * vec2(0.22, 0.35) + 3.0);
        float stain2 = envFbm3(wp * vec2(0.9, 0.6) + 11.0);
        float edgeZ = smoothstep(4.6, 6.0, abs(dW.z));
        // Salt-bleached patches and darker water stains.
        wood = mix(wood, wood * vec3(1.25, 1.22, 1.18) + 0.02, smoothstep(0.62, 0.8, stain) * 0.5);
        wood *= 1.0 - 0.35 * smoothstep(0.45, 0.75, stain2) * (0.4 + 0.6 * stain);
        // Algae / green slime near the edges.
        wood = mix(wood, vec3(0.05, 0.075, 0.035), edgeZ * smoothstep(0.35, 0.7, stain2) * 0.55);
        // Worn, dirty board edges + seams.
        float edgeX = smoothstep(0.72, 1.0, abs(across));
        float endD = min(abs(along - vBoard.z), abs(along - vBoard.w));
        float edgeE = smoothstep(0.08, 0.0, endD);
        wood *= 1.0 - 0.45 * max(edgeX * edgeX, edgeE) * isTop;
        // --- nails: two per board on every joist line, rust bleeding along the grain
        float rust = 0.0;
        for (int j = 0; j < 9; j++) {
          float dz = along - JOISTS[j];
          if (abs(dz) > 0.35) continue;
          for (int s = -1; s <= 1; s += 2) {
            if (envHash12(vec2(bSeed * 91.0 + float(j), float(s))) < 0.55) continue;
            vec2 d = vec2((across - float(s) * 0.5) * halfW, dz);
            float head = smoothstep(0.022, 0.012, length(d));
            float streak = exp(-pow(d.x / 0.018, 2.0)) * exp(-abs(dz) / 0.12) * (0.4 + 0.6 * gB);
            rust = max(rust, max(head, streak * 0.6));
          }
        }
        wood = mix(wood, vec3(0.13, 0.05, 0.02), rust * 0.55 * isTop);
        // --- wetness: puddles in low spots, damp edges and seams
        float pud = smoothstep(0.64, 0.74, envFbm(wp * vec2(0.16, 0.24) + 31.0) + edgeZ * 0.08);
        float damp = clamp(pud * uWetness + edgeZ * 0.35 + edgeX * 0.25 + rust * 0.2, 0.0, 1.0);
        wood *= 1.0 - 0.45 * damp;
        // Standing water: the wood under it goes much darker (a dark mirror, not a pale smudge).
        wood *= 1.0 - 0.45 * pud * uWetness;
        // --- blood / scorch decal (premultiplied)
        // Blood creeps along the grain (along z) inside each board.
        vec2 grainOff = vec2(0.0, (gB - 0.5) * 0.05 + (gC - 0.5) * 0.03);
        float creep = 0.05 + 0.09 * gB;
        vec4 dec = deckDecal(wp + grainOff);
        dec = max(dec, deckDecal(wp + grainOff + vec2(0.0, creep)) * 0.85);
        dec = max(dec, deckDecal(wp + grainOff - vec2(0.0, creep)) * 0.85);
        dec = max(dec, deckDecal(wp + grainOff + vec2(0.0, creep * 2.2)) * (0.45 + 0.4 * gC));
        dec = max(dec, deckDecal(wp + grainOff - vec2(0.0, creep * 2.2)) * (0.45 + 0.4 * gA));
        // Soaks into the grain and runs into the seams.
        float soak = clamp(0.8 + 0.5 * (1.0 - grain) + 0.6 * edgeX + 0.5 * edgeE, 0.0, 1.6);
        float da = clamp(dec.a * soak, 0.0, 1.0);
        // Darker than fresh paint: blood soaked into old wood.
        // Unpremultiplied blood colour, darkened: it soaked into old wood. Thin films go brown.
        vec3 bcol = dec.rgb / max(dec.a, 1e-4) * (0.36 + 0.14 * grain);
        bcol = mix(vec3(0.06, 0.014, 0.008), bcol, smoothstep(0.3, 0.85, da));
        float bloodWet = smoothstep(0.42, 0.85, da);
        vec3 deckAlbedo = mix(wood * (1.0 - 0.45 * da), bcol, da);
        // Sides of the boards: darker end grain.
        deckAlbedo *= mix(0.55, 1.0, isTop);
        diffuseColor.rgb = deckAlbedo;
        float deckWet = max(damp, bloodWet);
        vec2 deckGrad = (vec2(sign(across) * edgeX * edgeX * 0.5, 0.0) + vec2((gB - 0.5) * 0.06, (gA - 0.5) * 0.03) * (1.0 - deckWet)) * (1.0 - 0.97 * smoothstep(0.0, 0.6, pud * uWetness));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.86 - 0.12 * grain, 0.34, deckWet);
        roughnessFactor = mix(roughnessFactor, 0.2, pud * uWetness * (1.0 - da));`,
      )
      .replace('#include <lights_fragment_begin>', dirSpecularScaledLightsChunk('uDeckDirSpec', 0.3))
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Puddles mirror the lamps and the planar reflection, not the bright sky map (pale blue smudges at night).
        reflectedLight.indirectSpecular *= mix(1.0, uPudEnv, clamp(pud * uWetness * (1.0 - da) * 1.4, 0.0, 1.0));`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        #ifdef DECK_REFL
        {
          // Characters / bodies mirrored in puddles and blood (blurred, rippled by the grain).
          float rk = uReflStrength * max(pud * uWetness * (1.0 - da) * 0.9, bloodWet * 0.75) * isTop;
          if (rk > 0.004) {
            vec4 rc = uReflMatrix * vec4(vDeckWorld, 1.0);
            vec2 rUv = rc.xy / rc.w + deckGrad * 0.004 + vec2(0.0, (gB - 0.5) * 0.004);
            vec2 tx = uReflTexel * 1.5;
            vec4 r = texture2D(uReflMap, rUv) * 0.4
              + texture2D(uReflMap, rUv + vec2(tx.x, tx.y)) * 0.15
              + texture2D(uReflMap, rUv + vec2(-tx.x, tx.y)) * 0.15
              + texture2D(uReflMap, rUv + vec2(tx.x, -tx.y)) * 0.15
              + texture2D(uReflMap, rUv + vec2(-tx.x, -tx.y)) * 0.15;
            // Blood tints what it mirrors.
            vec3 rcol = r.rgb / max(r.a, 1e-3) * mix(vec3(1.0), vec3(0.9, 0.35, 0.3), bloodWet);
            outgoingLight = mix(outgoingLight, rcol, clamp(r.a * rk, 0.0, 1.0));
          }
        }
        #endif
        #include <opaque_fragment>`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (isTop > 0.5) {
          vec3 dn = normalize(vec3(-deckGrad.x, 1.0, -deckGrad.y));
          normal = normalize((viewMatrix * vec4(dn, 0.0)).xyz);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `lf-deck-v3-${opts.reflections ? 1 : 0}`;
  return mat;
}
