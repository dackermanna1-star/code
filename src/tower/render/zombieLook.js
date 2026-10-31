// LAST LOOKOUT — how the zombies look. A low-poly version of the engine's own sculpted body (the
// same SDF the ballistics trace, polygonised coarse: ~5k triangles), skinned by the sandbox's
// HumanMesh so wounds, blood, fractures and the X-ray kill cam keep working, dressed by a retro
// shader: chunky "pixel-art" clothes, rot and dried blood decided per texel of a texture-like grid
// laid round each limb, in a few flat shades; shape changes per kind are vertex displacement in
// sculpt space (bloater's belly, gaunt climbers and screamers, bulky bosses, a hanging jaw). Gear
// (helmets, vests, the bomb suit's visor and collar, the climber's hood) is one merged,
// vertex-coloured mesh per body part. Draw calls per zombie: body 1 + gear <= 2.
//
//   await prepareZombieMeshes();                       // once (worker; ~50 ms off the main thread)
//   const v = createZombieVisual(person, kind, scene);  // person = { id, rd, ... }
//   v.update(alpha)  // every frame, after the bodies were posed / stepped
//   v.setWounds(list), v.setPhysiology(pallor, cyanosis), v.addFracture(seg, frag, point, axis)
//   v.setHidden(on), v.setGearVisible(on), v.dropHelmet(dir), v.dispose()
//   v.hm is the HumanMesh (XRayRig.setGhost(v.hm, on) for the kill cam)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HumanMesh, MAX_WOUNDS } from '../../render/humanMesh.js';
import { BodyShape } from '../../human/bodyShape.js';
import { buildBodyMesh } from '../../human/bodyMesh.js';
import { buildSegmentList } from '../../human/anatomy.js';
import MeshWorker from '../../render/meshWorker.js?worker&inline';

/** Mesher settings of the low-poly body (~5.7k triangles, mitten hands, simple face). */
export const ZOMBIE_MESH_OPTS = { h: 0.035, fine: 0.15 };

let shared = null; // { data, shape, attrs }
let preparing = null;

const SEG_NAMES = buildSegmentList().map((d) => d.name);

/** Build the shared low-poly body (in a worker when possible). Resolves when ready. */
export function prepareZombieMeshes(opts = {}) {
  if (shared) return Promise.resolve(shared);
  if (preparing) return preparing;
  const meshOpts = { ...ZOMBIE_MESH_OPTS, ...(opts.mesh || {}) };
  preparing = new Promise((resolve) => {
    const done = (data) => {
      shared = makeShared(data);
      resolve(shared);
    };
    const local = () => setTimeout(() => done(buildBodyMesh(new BodyShape(SEG_NAMES), meshOpts)), 0);
    if (opts.worker === false) return local();
    try {
      const w = new MeshWorker();
      w.onmessage = (e) => {
        done(e.data);
        w.terminate();
      };
      w.onerror = () => {
        w.terminate();
        local();
      };
      w.postMessage({ segNames: SEG_NAMES, opts: meshOpts, tag: 'zombie' });
    } catch (e) {
      local();
    }
  });
  return preparing;
}

export function zombieMeshesReady() {
  return !!shared;
}

function makeShared(data) {
  const shape = new BodyShape(SEG_NAMES);
  // position / normal / index are the same for every zombie: one GPU copy
  const attrs = {
    position: new THREE.BufferAttribute(data.positions, 3),
    normal: new THREE.BufferAttribute(data.normals, 3),
    index: new THREE.BufferAttribute(data.indices, 1),
  };
  return { data, shape, attrs, tris: data.indices.length / 3 };
}

// ------------------------------------------------------------------------------------------------
// kinds

function rng(seed) {
  let s = (seed * 2654435761 + 12345) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

// farm / town clothes
const SHIRTS = [0x8a2a22, 0x2f4a6b, 0x4f6a3a, 0xd8d4c8, 0x5a3e2c, 0x6b6f74, 0x8c6a2a, 0x3c3c44, 0xa04a2a, 0x2e5a5a, 0x6a2a4a, 0xc8a83a];
const SHIRTS2 = [0x1c1c22, 0xd8d0b8, 0x2a3a22, 0x6a1a14, 0x22304a];
const PANTS = [0x2c3e5c, 0x34445e, 0x4a4234, 0x2a2a2e, 0x5c5240, 0x3b4a32, 0x6a5a44];
const SHOES = [0x2a1e16, 0x1a1a1c, 0x4a3a2a, 0x3a3430];
const HAIR = [0x2a1e14, 0x14110e, 0x5a4a32, 0x8a7a5a, 0x3a2a1c, 0x9a9890, 0x6a3a1a];
const SKINS = [0x6f7a5e, 0x7a8066, 0x66705a, 0x7e7a64, 0x5e6652, 0x747c6c];

export const ZOMBIE_KINDS = ['walker', 'runner', 'crawler', 'climber', 'bloater', 'screamer', 'armored', 'brute', 'juggernaut'];

/**
 * Look parameters of one zombie of `kind` (varied by id). Colours are display values 0..1.
 * shirtPat: 0 plain, 1 plaid, 2 stripes, 3 tracksuit, 4 rags; pantsStyle: 0 trousers, 1 overalls,
 * 2 shorts, 3 track pants, 4 bomb suit (whole body); sleeves: 0 none .. 1 long; crop: the shirt ends
 * at this height (the bloater's belly shows); hood, bald, longHair; rot, gore, tear: 0..1; shape:
 * bloat, inflate (bulk), thin, jaw (hanging); gear: null | 'riot' | 'riotHeavy' | 'eod' | 'hood'.
 */
export function zombieStyle(kind, id = 1) {
  const r = rng(id * 7919 + kind.length * 31);
  const s = {
    kind, seed: r(), skin: hex(pick(r, SKINS)), shirt: hex(pick(r, SHIRTS)), shirt2: hex(pick(r, SHIRTS2)),
    pants: hex(pick(r, PANTS)), shoes: hex(pick(r, SHOES)), hair: hex(pick(r, HAIR)),
    shirtPat: pick(r, [0, 0, 1, 1, 2]), pantsStyle: pick(r, [0, 0, 0, 1, 2]), sleeves: pick(r, [1, 1, 0.25, 0.25, 0]),
    hood: 0, bald: r() < 0.25 ? 1 : 0, rot: 0.35 + 0.5 * r(), gore: 0.3 + 0.6 * r(), tear: 0.25 + 0.4 * r(),
    crop: 0, longHair: 0,
    bloat: 0, inflate: 0, thin: 0, jaw: 0.15 * r(), pale: 0, veins: 0, gear: null, castShadow: false,
  };
  switch (kind) {
    case 'runner':
      s.shirtPat = 3; s.pantsStyle = 3; s.sleeves = 1;
      s.shirt = hex(pick(r, [0x2a3a7a, 0x7a1e1e, 0x1e5a3a, 0x3a3a3e, 0x6a2a6a]));
      s.shirt2 = [0.85, 0.85, 0.8];
      s.pants = s.shirt.map((v) => v * 0.8);
      s.thin = 0.2; s.tear = 0.2;
      break;
    case 'crawler':
      s.tear = 0.75; s.gore = 0.9; s.rot = 0.85; s.sleeves = pick(r, [1, 0.25]);
      s.shirt = s.shirt.map((v) => v * 0.6); s.pants = s.pants.map((v) => v * 0.7);
      s.thin = 0.15;
      break;
    case 'climber':
      s.hood = 1; s.shirtPat = 0; s.sleeves = 1; s.pantsStyle = 0;
      s.shirt = hex(pick(r, [0x5a5e66, 0x4e5a52, 0x625648, 0x4a4e5e]));
      s.shirt2 = hex(0x9a9a94);
      s.pants = hex(pick(r, [0x2e3440, 0x34343a, 0x3a342a]));
      s.skin = hex(0x8a9078); s.thin = 0.55; s.tear = 0.2; s.gore = 0.5; s.gear = 'hood';
      break;
    case 'bloater':
      s.bloat = 1; s.inflate = 0.3; s.veins = 1; s.sleeves = 0; s.shirtPat = 0; s.crop = 1.19;
      s.shirt = hex(0xc0b48c); s.skin = hex(0x8f9a66); s.pale = 0.1; s.tear = 0.45; s.rot = 0.8; s.bald = 1; s.gore = 0.3;
      s.pants = hex(pick(r, [0x4a4234, 0x3a4a5a, 0x5a4a3a]));
      break;
    case 'screamer':
      s.thin = 0.8; s.jaw = 1; s.tear = 0.85; s.shirtPat = 4; s.sleeves = pick(r, [0.25, 0]); s.longHair = 1;
      s.skin = hex(0x9aa098); s.pale = 0.45; s.veins = 0.5; s.bald = 0; s.hair = hex(pick(r, [0x1a1612, 0x5a5a54, 0x2e2418]));
      s.shirt = hex(pick(r, [0x8a8070, 0x6a6458, 0x7a6a5a])); s.gore = 0.8;
      break;
    case 'armored':
      s.shirt = hex(0x1e2430); s.pants = hex(0x1c2028); s.shirtPat = 0; s.pantsStyle = 0; s.sleeves = 1;
      s.shoes = hex(0x101012); s.gear = 'riot'; s.tear = 0.15;
      break;
    case 'brute':
      s.shirt = hex(0x22262a); s.pants = hex(0x1e2024); s.shirtPat = 0; s.pantsStyle = 0; s.sleeves = 0.25;
      s.shoes = hex(0x101012); s.gear = 'riotHeavy'; s.inflate = 1; s.tear = 0.3; s.skin = hex(0x7f8270); s.castShadow = true;
      break;
    case 'juggernaut':
      s.shirt = hex(0x4a5236); s.pants = hex(0x444c32); s.shirt2 = hex(0x2a2e22); s.shirtPat = 0; s.pantsStyle = 4; s.sleeves = 1;
      s.shoes = hex(0x1a1a16); s.gear = 'eod'; s.inflate = 1.7; s.tear = 0.1; s.gore = 0.4; s.castShadow = true;
      break;
    default:
      break;
  }
  return s;
}

// ------------------------------------------------------------------------------------------------
// the retro skin material

const VERT_PARS = /* glsl */ `
attribute float blood;
varying float vBlood;
varying vec3 vModelPos;
varying vec3 vModelNrm;
uniform vec4 uShape;   // x bloat, y inflate, z thin, w jaw
// how far to push a sculpt-space point along its normal for this kind
float zShape(vec3 P) {
  if (uShape.x + uShape.y + uShape.z == 0.0) return 0.0; // plain walkers: no work per vertex
  float ax = abs(P.x);
  // the bloater's belly: a big ball on the front of the abdomen, its flanks and the back
  float belly = exp(-pow(length((P - vec3(0.0, 1.06, 0.06)) * vec3(1.0, 1.25, 1.1)) / 0.2, 2.0));
  float flank = exp(-pow(length((P - vec3(0.0, 1.12, -0.02)) * vec3(0.8, 0.9, 1.4)) / 0.22, 2.0));
  float armZ = smoothstep(0.17, 0.24, ax) * step(0.8, P.y);
  float torso = (1.0 - armZ) * smoothstep(0.86, 0.96, P.y) * (1.0 - smoothstep(1.46, 1.52, P.y));
  float limbs = armZ + (1.0 - smoothstep(0.84, 0.95, P.y)) * smoothstep(0.1, 0.2, P.y);
  float head = smoothstep(1.52, 1.56, P.y);
  float d = uShape.x * (0.2 * belly + 0.07 * flank);
  // bulk: chest, shoulders, arms and thighs (bosses)
  d += uShape.y * (0.035 * torso + 0.022 * limbs * (1.0 - smoothstep(0.55, 0.75, ax)) + 0.01 * head);
  // gaunt: limbs and torso thinner, sunken cheeks
  float cheek = exp(-pow(length((vec3(ax, P.y, P.z) - vec3(0.045, 1.635, 0.06)) * vec3(1.0, 1.2, 1.0)) / 0.03, 2.0));
  d -= uShape.z * (0.012 * limbs + 0.014 * torso + 0.008 * cheek);
  return d;
}
`;

const FRAG_PARS = /* glsl */ `
#define MAX_WOUNDS ${MAX_WOUNDS}
uniform sampler2D uWounds;
uniform int uWoundCount;
uniform float uPallor;
uniform float uCyanosis;
uniform vec4 uKind;    // x seed, y rot, z gore, w tear
uniform vec4 uStyle;   // x shirt pattern, y pants style, z sleeves, w hood
uniform vec4 uStyle2;  // x bald, y pale, z veins, w jaw
uniform vec4 uStyle3;  // x crop (shirt ends at this height: a belly shows), y long stringy hair
uniform vec3 uSkin, uShirt, uShirt2, uPants, uShoes, uHair;
varying float vBlood;
varying vec3 vModelPos;
varying vec3 vModelNrm;

#define CELL 0.024
float h31(vec3 p) {
  p = fract(p * 0.1031 + vec3(0.13, 0.27, 0.41));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vn3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// 2x2 ordered dither on texel coordinates: hard, sprite-like shade steps instead of smooth noise
float dith(vec3 C) {
  vec2 c = mod(C.xy, 2.0);
  return (c.x * 2.0 + c.y + 0.5) / 4.0;
}
float steps(float v, vec3 C) { return step(dith(C), v); }

bool torso_belly(vec3 P) { return P.y > 0.99 && P.y < 1.2 && P.z > -0.05 && abs(P.x) < 0.2; }

// Clothes and skin at sculpt-space point P (feet at y = 0, facing +z, left = +x; the arms stick out
// 45 degrees from the shoulders at (+-0.18, 1.43), the legs hang from the hips at (+-0.088, 0.925)).
// Texels are laid out like a hand-made texture: rows along each limb / the trunk, columns round it
// (CELL square), and everything is decided per texel in a few flat shades, like a sprite sheet.
vec3 zombieColor(vec3 P, vec3 N, out float cloth) {
  float sd = uKind.x * 97.0;
  float ax = abs(P.x), side = P.x >= 0.0 ? 1.0 : -1.0;
  // --- body regions
  vec3 S = vec3(side * 0.18, 1.43, -0.035);
  vec3 adir = vec3(side * 0.7071, -0.7071, 0.0);
  float ta = dot(P - S, adir);
  vec3 radial = (P - S) - adir * ta;
  float ra = length(radial);
  bool arm = ta > -0.02 && ra < 0.105 && P.y > 0.78 && ax > 0.13;
  bool hand = arm && ta > 0.555;
  bool head = !arm && P.y > 1.53 && ax < 0.13;
  bool feet = !arm && P.y < 0.105;
  bool legs = !arm && !feet && P.y < 0.95;
  bool torso = !arm && !head && !legs && !feet;
  // --- texel grid: (round, along, part)
  vec3 C;
  if (arm) {
    vec3 e2 = normalize(cross(adir, vec3(0.0, 0.0, 1.0)));
    float ang = atan(dot(radial, e2), radial.z);
    C = vec3(floor(ang * 0.05 / CELL), floor(ta / CELL), 3.0 + side);
  } else if (legs || feet) {
    float ang = atan(P.z + 0.01, P.x - side * 0.1);
    C = vec3(floor(ang * 0.075 / CELL), floor(P.y / CELL), 6.0 + side);
  } else {
    float ang = atan(P.z + 0.02, P.x);
    C = vec3(floor(ang * (head ? 0.09 : 0.15) / CELL), floor(P.y / CELL), head ? 9.0 : 0.0);
  }
  float n1 = h31(C + sd);
  float big = vn3(vec3(C.xy * 0.22, C.z * 7.0 + sd)), mid = vn3(vec3(C.xy * 0.5, C.z * 5.0 - sd));
  vec3 Q = P;
  // --- skin: one base tone, rot blotches in a flat second shade, veins on bloaters
  vec3 col = uSkin * (0.97 + 0.06 * n1);
  float rotM = steps(smoothstep(0.55, 0.78, big + 0.2 * mid) * uKind.y * 1.3, C);
  col = mix(col, uSkin * vec3(0.7, 0.6, 0.72), rotM);
  float veinM = (1.0 - smoothstep(0.0, 0.05, abs(vn3(vec3(C.xy * 0.35, C.z + sd)) - 0.5))) * uStyle2.z;
  col = mix(col, vec3(0.36, 0.26, 0.42), step(0.5, veinM) * 0.75);
  col = mix(col, vec3(0.84, 0.83, 0.78), uStyle2.y * 0.4);
  if (uStyle3.x > 0.0 && torso_belly(P)) {
    float marks = step(0.82, fract(P.y * 30.0 + 0.3 * sin(P.x * 40.0))) * step(0.35, abs(P.x) * 4.0);
    col = mix(col, vec3(0.62, 0.5, 0.56), marks * 0.6);
    col = mix(col, vec3(0.42, 0.5, 0.36), smoothstep(0.55, 0.8, big) * 0.5); // green-black rot, ready to burst
  }
  cloth = 0.0;
  vec3 cc = col;
  float pat = uStyle.x, pst = uStyle.y;
  bool sleeve = arm && !hand && ta < uStyle.z * 0.56;
  bool collar = torso && Q.z > 0.0 && P.y > 1.37 - 0.3 * ax && ax < 0.07 && pat < 3.5 && pst < 3.5;
  bool belly = torso && uStyle3.x > 0.0 && P.y < uStyle3.x && P.y > 0.99;
  if ((torso && !collar && !belly) || sleeve) {
    cc = uShirt;
    if (pat > 0.5 && pat < 1.5) {          // plaid / flannel
      vec2 g = mod(C.xy, 5.0);
      float a = g.y < 1.5 ? 1.0 : 0.0, b = g.x < 1.5 ? 1.0 : 0.0;
      cc = mix(uShirt, uShirt2, 0.5 * max(a, b));
      if (a * b > 0.5) cc = uShirt2;
    } else if (pat > 1.5 && pat < 2.5) {   // stripes
      cc = mod(C.y, 3.0) < 1.0 ? mix(uShirt, uShirt2, 0.8) : uShirt;
    } else if (pat > 2.5 && pat < 3.5) {   // tracksuit: zip, white stripes down the sleeves
      if (torso && ax < 0.012 && Q.z > 0.0) cc = uShirt2;
      if (sleeve && dot(radial, normalize(vec3(side, 1.0, 0.0))) > 0.75 * ra) cc = uShirt2;
    } else if (pat > 3.5) {                // rags: faded patches
      cc = mix(uShirt, uShirt * 0.75 + 0.08, steps(smoothstep(0.4, 0.7, big), C));
    }
    if (sleeve && ta > uStyle.z * 0.56 - CELL) cc *= 0.7; // hem
    if (torso && uStyle3.x > 0.0 && P.y < uStyle3.x + CELL) cc *= 0.7; // rolled-up hem over the belly
    cloth = 1.0;
  }
  if (pst > 0.5 && pst < 1.5 && torso) {   // overalls: bib, straps and back panel
    bool bib = Q.z > 0.0 && ax < 0.11 && P.y < 1.3;
    bool strap = abs(ax - 0.085) < 0.02 && P.y < 1.47;
    bool back = Q.z < 0.0 && P.y < 1.12;
    if (bib || strap || back) cc = uPants;
    if (bib && P.y > 1.27) cc = uPants * 0.75;
  }
  if (legs || (torso && P.y < 1.0)) {      // trousers / shorts / track pants
    bool bare = pst > 1.5 && pst < 2.5 && P.y < 0.62;
    if (!bare) {
      cc = uPants;
      if (pst < 0.5 && abs(P.y - 0.53) < 0.06) cc *= 1.12;                    // worn knees
      if (pst > 2.5 && pst < 3.5 && legs && abs(atan(Q.z + 0.01, ax - 0.1)) < 0.35) cc = uShirt2; // side stripe
      if (pst < 1.5 && P.y > 0.935 && P.y < 0.97) cc = vec3(0.13, 0.09, 0.06);  // belt
      if (pst < 1.5 && P.y > 0.935 && P.y < 0.97 && ax < 0.02 && Q.z > 0.0) cc = vec3(0.6, 0.55, 0.4);
      cloth = 1.0;
    }
  }
  if (pst > 3.5 && !hand && !head) {       // bomb suit: everything but the hands, quilted
    cc = mix(uShirt, uPants, step(P.y, 0.95));
    if (mod(C.y, 4.0) < 1.0) cc *= 0.82;
    cloth = 1.0;
  }
  if (feet) { cc = uShoes; if (P.y < 0.025) cc *= 0.6; cloth = 1.0; }
  if (uStyle.w > 0.5 && (head || (torso && P.y > 1.38))) {   // hood, face left open
    bool face = Q.z > 0.03 && P.y < 1.735 && P.y > 1.55 && ax < 0.068;
    if (!face) { cc = uShirt * (Q.z > 0.02 && P.y > 1.7 ? 0.6 : 0.95); cloth = 1.0; }
  }
  if (head && uStyle.w < 0.5 && uStyle2.x < 0.5) {          // hair
    bool hair = P.y > 1.715 - 0.07 * smoothstep(0.0, -0.08, Q.z) || (Q.z < -0.035 && P.y > 1.6)
      || (uStyle3.y > 0.5 && (Q.z < 0.02 || ax > 0.06) && P.y > 1.52 && mod(C.x, 2.0) < 1.5 - step(0.7, n1));
    if (hair && !(Q.z > 0.07 && P.y < 1.75)) { cc = uHair * (0.85 + 0.25 * steps(n1, C)); cloth = 0.5; }
  }
  if (cloth > 0.0) {
    // dirt in a flat darker shade, rare tears that show the skin with a dark frayed edge
    float dirt = smoothstep(0.52, 0.8, big);
    cc *= mix(1.0, 0.74, steps(dirt, C));
    cc *= 0.97 + 0.06 * n1;
    float tearN = big * 0.65 + mid * 0.35;
    float thr = 1.0 - uKind.w * 0.3;
    float hole = step(thr, tearN) * (feet ? 0.0 : 1.0) * (pst > 3.5 ? 0.0 : 1.0);
    float edge = step(thr - 0.05, tearN) * (1.0 - hole);
    cc *= 1.0 - 0.45 * edge;
    col = mix(col, cc, 1.0 - hole);
    cloth *= 1.0 - hole;
  }
  if (head) {                              // face: sockets, clouded eyes, the mouth
    vec3 F = vec3(ax, P.y, P.z);
    float sock = step(length((F - vec3(0.032, 1.676, 0.085)) * vec3(1.0, 1.4, 1.0)), 0.02);
    col = mix(col, vec3(0.1, 0.08, 0.08), sock * 0.9);
    float eye = step(length(F - vec3(0.031, 1.68, 0.09)), 0.009);
    col = mix(col, vec3(0.88, 0.86, 0.7), eye);
    float jaw = uStyle2.w;
    float mouth = step(length((F - vec3(0.0, 1.598 - 0.02 * jaw, 0.085)) * vec3(0.8, 1.6 - 0.9 * jaw, 1.0)), 0.016 + 0.016 * jaw);
    col = mix(col, vec3(0.07, 0.02, 0.02), mouth);
  }
  // dried blood: chin, a drip down the front of the gorier ones, a few splashes
  float chin = step(length((vec3(ax, P.y, P.z) - vec3(0.0, 1.585, 0.075)) * vec3(1.0, 0.8, 1.0)), 0.035);
  float dripLen = mix(1.6, 1.2, uKind.z);
  float drip = (1.0 - step(0.035 + 0.03 * uKind.z, ax + 0.02 * vn3(vec3(0.0, C.y * 0.4, sd)))) * step(0.02, Q.z) * step(P.y, 1.59) * step(dripLen, P.y)
    * step(0.45, vn3(vec3(C.x * 0.7, C.y * 0.12, sd)));
  float splash = step(0.9 - 0.06 * uKind.z, vn3(vec3(C.xy * 0.3, C.z * 3.0 + sd * 2.0)) * 0.8 + mid * 0.3);
  float gore = clamp(chin * step(0.35, uKind.z) + drip * step(0.55, uKind.z) * step(uStyle3.x, 0.0) + splash, 0.0, 1.0);
  col = mix(col, vec3(0.24, 0.035, 0.03) * (0.85 + 0.2 * n1), gore);
  return col;
}

vec4 woundShade(vec3 P, out float wet) {
  vec3 col = vec3(0.0);
  float amt = 0.0;
  wet = 0.0;
  for (int i = 0; i < MAX_WOUNDS; i++) {
    if (i >= uWoundCount) break;
    vec4 wp = texelFetch(uWounds, ivec2(i, 0), 0);
    vec3 d = P - wp.xyz;
    float r = wp.w;
    float dist = length(d);
    if (dist > r * 6.0) continue;
    vec4 wi = texelFetch(uWounds, ivec2(i, 1), 0);
    float kind = wi.x, sev = wi.z;
    if (kind < 2.5) {
      float rr = r * (kind > 0.5 ? 1.15 : 0.95);
      if (kind > 1.5) {
        vec3 dirv = normalize(texelFetch(uWounds, ivec2(i, 2), 0).xyz + 1e-5);
        float along = dot(d, dirv);
        dist = length(d - dirv * along + dirv * along * 0.3);
      }
      float core = 1.0 - smoothstep(rr * 0.5, rr * 0.9, dist);
      float rim = (1.0 - smoothstep(rr * 0.9, rr * 1.7, dist)) * (1.0 - core);
      float halo = (1.0 - smoothstep(rr, rr * (3.0 + 2.5 * sev), dist)) * 0.4;
      vec3 c = mix(vec3(0.32, 0.08, 0.08), vec3(0.45, 0.06, 0.05), rim);
      c = mix(c, vec3(0.03, 0.0, 0.0), core);
      float a = max(halo, max(rim * 0.95, core));
      col = mix(col, c, a);
      amt = max(amt, a);
      wet = max(wet, max(core, rim * 0.6));
    } else if (kind < 3.5) {
      float b = (1.0 - smoothstep(r * 0.4, r, dist)) * clamp(sev, 0.0, 1.0);
      col = mix(col, vec3(0.3, 0.12, 0.28), b * 0.75);
      amt = max(amt, b * 0.75);
    } else {
      float b = (1.0 - smoothstep(r * 0.6, r, dist)) * clamp(sev, 0.0, 1.0);
      col = mix(col, vec3(0.5, 0.1, 0.08), b);
      amt = max(amt, b * 0.85);
      wet = max(wet, b * 0.4);
    }
  }
  return vec4(col, amt);
}
`;

const _sharedUniforms = { uTime: { value: 0 } };

/** Per-zombie skin material (wounds and physiology are per person). */
export function createZombieMaterial(style) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const woundTex = new THREE.DataTexture(new Float32Array(MAX_WOUNDS * 3 * 4), MAX_WOUNDS, 3, THREE.RGBAFormat, THREE.FloatType);
  woundTex.minFilter = THREE.NearestFilter;
  woundTex.magFilter = THREE.NearestFilter;
  woundTex.needsUpdate = true;
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const uniforms = {
    uWounds: { value: woundTex },
    uWoundCount: { value: 0 },
    uPallor: { value: 0 },
    uCyanosis: { value: 0 },
    uKind: { value: new THREE.Vector4(style.seed, style.rot, style.gore, style.tear) },
    uStyle: { value: new THREE.Vector4(style.shirtPat, style.pantsStyle, style.sleeves, style.hood) },
    uStyle2: { value: new THREE.Vector4(style.bald, style.pale, style.veins, style.jaw) },
    uShape: { value: new THREE.Vector4(style.bloat, style.inflate, style.thin, style.jaw) },
    uStyle3: { value: new THREE.Vector4(style.crop, style.longHair, 0, 0) },
    uSkin: { value: v3(style.skin) },
    uShirt: { value: v3(style.shirt) },
    uShirt2: { value: v3(style.shirt2) },
    uPants: { value: v3(style.pants) },
    uShoes: { value: v3(style.shoes) },
    uHair: { value: v3(style.hair) },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, _sharedUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // shape of the kind, in sculpt space before skinning; the hanging jaw drops the chin
        transformed += normal * zShape(position);
        float jawM = smoothstep(1.625, 1.6, position.y) * step(1.53, position.y) * smoothstep(0.0, 0.05, position.z) * (1.0 - smoothstep(0.06, 0.08, abs(position.x)));
        transformed += vec3(0.0, -0.035, 0.012) * jawM * uShape.w;
        vBlood = blood;
        vModelPos = transformed;
        vModelNrm = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float cloth;
        diffuseColor.rgb = zombieColor(vModelPos, vModelNrm, cloth);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.77, 0.74) * dot(diffuseColor.rgb, vec3(0.33)) * 1.3, uPallor * 0.5 * (1.0 - cloth));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.8, 1.08), uCyanosis * 0.6 * (1.0 - cloth));
        float wWet;
        vec4 ws = woundShade(vModelPos, wWet);
        diffuseColor.rgb = mix(diffuseColor.rgb, ws.rgb, ws.a);
        float bl = clamp(vBlood, 0.0, 1.5);
        float cover = smoothstep(0.05, 0.3, bl + (h31(floor(vModelPos / CELL) * 3.1) - 0.5) * 0.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.42, 0.04, 0.03), vec3(0.2, 0.01, 0.01), smoothstep(0.3, 1.2, bl)), cover);
        // the palette above is authored in display (sRGB) values; lighting works in linear
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(2.2));`,
      );
  };
  mat.customProgramCacheKey = () => 'tower-zombie-v2';
  return mat;
}

// ------------------------------------------------------------------------------------------------
// gear: one merged, vertex-coloured mesh per body part, shared geometry and material

let gearMat = null;
const gearGeo = {};

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function place(geo, { p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0] } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  geo.applyMatrix4(m);
  return geo;
}

function buildGear(type) {
  if (gearGeo[type]) return gearGeo[type];
  const parts = { head: [], chest: [] };
  const dark = 0x23262a, darker = 0x15171a, plate = 0x2f3338, olive = 0x4a5236, oliveD = 0x30361f, glass = 0x6f8a96;
  if (type === 'riot' || type === 'riotHeavy') {
    const k = type === 'riotHeavy' ? 1.12 : 1;
    // helmet: low-poly dome, brim, raised visor (frame + glass)
    parts.head.push(colored(place(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), { p: [0, 0.035, -0.008], s: [0.122 * k, 0.118 * k, 0.138 * k] }), dark));
    parts.head.push(colored(place(new THREE.CylinderGeometry(1, 1.06, 0.02, 10), { p: [0, 0.03, -0.01], s: [0.128 * k, 1, 0.146 * k] }), darker));
    parts.head.push(colored(place(new THREE.BoxGeometry(0.2 * k, 0.07, 0.02), { p: [0, 0.075, 0.13 * k], r: [-0.5, 0, 0] }), glass));
    parts.head.push(colored(place(new THREE.BoxGeometry(0.21 * k, 0.012, 0.03), { p: [0, 0.11, 0.115 * k], r: [-0.5, 0, 0] }), darker));
    // vest: shell, plates front/back, collar
    parts.chest.push(colored(place(new THREE.CylinderGeometry(1, 1.04, 1, 10, 1, false), { p: [0, -0.1, 0], s: [0.215 * k, 0.4, 0.165 * k] }), dark));
    for (const f of [-1, 1]) {
      parts.chest.push(colored(place(new THREE.BoxGeometry(0.27 * k, 0.3, 0.04), { p: [0, -0.06, f * 0.16 * k] }), plate));
    }
    parts.chest.push(colored(place(new THREE.BoxGeometry(0.17, 0.05, 0.01), { p: [0, 0.02, 0.185 * k] }), 0xbfc4c8));
    if (type === 'riotHeavy') {
      for (const sx of [-1, 1]) parts.chest.push(colored(place(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), { p: [sx * 0.2, 0.08, -0.01], s: [0.09, 0.06, 0.1], r: [0, 0, -sx * 0.5] }), plate));
      parts.chest.push(colored(place(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 10), { p: [0, 0.17, -0.01] }), darker));
    }
  } else if (type === 'hood') {
    // the climber's hood: a cowl over the back and crown of the head, down the sides to the jaw,
    // a little peak over the brow; the face stays open
    const cloth = 0x3c3f46;
    parts.head.push(colored(place(new THREE.SphereGeometry(1, 9, 7, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.78), { p: [0, 0.03, -0.012], s: [0.105, 0.118, 0.118] }), cloth));
    parts.head.push(colored(place(new THREE.ConeGeometry(0.05, 0.05, 6, 1, true), { p: [0, 0.135, 0.02], r: [-1.2, 0, 0] }), 0x2e3036));
  } else if (type === 'eod') {
    // bomb-disposal helmet: a big rounded shell with a flat visor
    parts.head.push(colored(place(new THREE.SphereGeometry(1, 10, 8), { p: [0, 0.02, -0.01], s: [0.16, 0.17, 0.175] }), olive));
    parts.head.push(colored(place(new THREE.BoxGeometry(0.2, 0.13, 0.03), { p: [0, 0.01, 0.16], r: [-0.12, 0, 0] }), glass));
    parts.head.push(colored(place(new THREE.BoxGeometry(0.23, 0.15, 0.02), { p: [0, 0.01, 0.15], r: [-0.12, 0, 0] }), oliveD));
    // collar / chest plate: thick neck guard and a big front plate
    parts.chest.push(colored(place(new THREE.CylinderGeometry(0.15, 0.19, 0.12, 10), { p: [0, 0.17, -0.01] }), oliveD));
    parts.chest.push(colored(place(new THREE.BoxGeometry(0.36, 0.42, 0.07), { p: [0, -0.06, 0.2] }), olive));
    parts.chest.push(colored(place(new THREE.BoxGeometry(0.4, 0.36, 0.06), { p: [0, -0.04, -0.17] }), oliveD));
    for (const sx of [-1, 1]) parts.chest.push(colored(place(new THREE.SphereGeometry(1, 8, 5), { p: [sx * 0.2, 0.09, -0.01], s: [0.1, 0.08, 0.12] }), olive));
  }
  const out = {};
  for (const k of Object.keys(parts)) if (parts[k].length) out[k] = mergeGeometries(parts[k]);
  gearGeo[type] = out;
  return out;
}

function getGearMaterial() {
  if (!gearMat) gearMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return gearMat;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s1 = new THREE.Vector3(1, 1, 1);
// gear offsets in the body frame (body frames are world-aligned in the bind pose)
const GEAR_OFFSET = { head: [0, 0.0, -0.005], chest: [0, 0.0, 0.004] };
const CULL_RADIUS = 1.3; // every part of the body stays within this of the pelvis

/** Interpolated body pose (framePos/frameRot -> pos/rot by alpha) into _p / _q, allocation free. */
function bodyPose(b, alpha) {
  const fp = b.framePos, p = b.pos;
  _p.set(fp.x + (p.x - fp.x) * alpha, fp.y + (p.y - fp.y) * alpha, fp.z + (p.z - fp.z) * alpha);
  const fr = b.frameRot, r = b.rot;
  if (alpha >= 1) _q.set(r.x, r.y, r.z, r.w);
  else {
    _q.set(fr.x, fr.y, fr.z, fr.w);
    _q2.set(r.x, r.y, r.z, r.w);
    _q.slerp(_q2, alpha);
  }
}

// ------------------------------------------------------------------------------------------------

/**
 * A zombie's visual: skinned low-poly body + gear. person: { id, rd } (the ragdoll); kind: one of
 * walker, runner, crawler, climber, bloater, screamer, armored, brute, juggernaut.
 * opts: { style (from zombieStyle, to override), castShadow }.
 */
export function createZombieVisual(person, kind, scene, opts = {}) {
  if (!shared) throw new Error('createZombieVisual: await prepareZombieMeshes() first');
  const style = opts.style || zombieStyle(kind, person.id ?? 1);
  const material = createZombieMaterial(style);
  const hm = new HumanMesh(shared.data, person.rd, shared.shape, { material });
  // share the static attributes between all zombies (one GPU copy)
  const geo = hm.geometry;
  geo.setAttribute('position', shared.attrs.position);
  geo.setAttribute('normal', shared.attrs.normal);
  geo.setIndex(shared.attrs.index);
  const mesh = hm.mesh;
  mesh.castShadow = !!(opts.castShadow ?? style.castShadow);
  mesh.receiveShadow = false;
  // culled like any mesh: a sphere round the pelvis, kept up to date in update()
  mesh.frustumCulled = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CULL_RADIUS);
  const object = new THREE.Group();
  object.name = 'zombie:' + kind;
  object.add(mesh);
  const gear = [];
  if (style.gear) {
    const G = buildGear(style.gear);
    for (const part of ['head', 'chest']) {
      if (!G[part]) continue;
      const m = new THREE.Mesh(G[part], getGearMaterial());
      m.matrixAutoUpdate = false;
      m.castShadow = mesh.castShadow;
      object.add(m);
      gear.push({ mesh: m, body: person.rd.segments[part].body, off: GEAR_OFFSET[part], part });
    }
  }
  const loose = []; // gear knocked off, tumbling to the floor
  scene.add(object);
  let hidden = false;
  const pelvis = person.rd.segments.pelvis.body;
  const visual = {
    object, hm, kind, style, gear,
    /** Follow the bodies (interpolated framePos/frameRot -> pos/rot by alpha), animated or physical. */
    update(alpha = 1, dt = 1 / 60) {
      for (const l of loose) tumble(l, dt);
      if (hidden) return;
      const bones = hm.bones, bodies = hm.boneBodies;
      for (let i = 0; i < bones.length; i++) {
        const b = bodies[i];
        if (!b) continue;
        bodyPose(b, alpha);
        bones[i].matrixWorld.compose(_p, _q, _s1);
      }
      if (hm.bloodDirty) {
        hm.bloodAttr.needsUpdate = true;
        hm.bloodDirty = false;
      }
      bodyPose(pelvis, alpha);
      mesh.boundingSphere.center.copy(_p);
      for (const g of gear) {
        bodyPose(g.body, alpha);
        g.mesh.matrix.makeRotationFromQuaternion(_q);
        const o = g.off, e = g.mesh.matrix.elements;
        e[12] = _p.x + e[0] * o[0] + e[4] * o[1] + e[8] * o[2];
        e[13] = _p.y + e[1] * o[0] + e[5] * o[1] + e[9] * o[2];
        e[14] = _p.z + e[2] * o[0] + e[6] * o[1] + e[10] * o[2];
        g.mesh.matrixWorldNeedsUpdate = true;
      }
    },
    setWounds(list) {
      hm.setWounds(list);
    },
    setPhysiology(pallor, cyanosis) {
      hm.setPhysiology(pallor, cyanosis);
    },
    addFracture(seg, fragment, pointBind, axisBind) {
      return hm.addFracture(seg, fragment, pointBind, axisBind);
    },
    /**
     * The helmet comes off (shot off): it flies along dir (world, {x,y,z}) and tumbles to the floor
     * (floorAt(x, z) -> height, default 0). Returns false when there is no helmet.
     */
    dropHelmet(dir, floorAt = null) {
      const i = gear.findIndex((g) => g.part === 'head');
      if (i < 0) return false;
      const g = gear.splice(i, 1)[0];
      g.mesh.matrix.decompose(g.mesh.position, g.mesh.quaternion, g.mesh.scale);
      g.mesh.matrixAutoUpdate = true;
      const l = Math.hypot(dir.x, dir.z) || 1;
      loose.push({ mesh: g.mesh, v: new THREE.Vector3((dir.x / l) * 2.5, 2.2, (dir.z / l) * 2.5), w: new THREE.Vector3(8 * (Math.random() - 0.5), 0, 8 * (Math.random() - 0.5)), floorAt, rest: false });
      return true;
    },
    setHidden(on) {
      hidden = !!on;
      mesh.visible = !hidden;
      for (const g of gear) g.mesh.visible = !hidden;
    },
    /** Show / hide the gear alone (e.g. while the X-ray kill cam ghosts the body). */
    setGearVisible(on) {
      for (const g of gear) g.mesh.visible = !!on && !hidden;
    },
    dispose() {
      scene.remove(object);
      // keep the shared attributes alive: detach them before the geometry is disposed
      geo.deleteAttribute('position');
      geo.deleteAttribute('normal');
      geo.setIndex(null);
      hm.dispose();
    },
  };
  return visual;
}

function tumble(l, dt) {
  if (l.rest) return;
  const m = l.mesh;
  l.v.y -= 9.81 * dt;
  m.position.addScaledVector(l.v, dt);
  m.rotation.x += l.w.x * dt;
  m.rotation.z += l.w.z * dt;
  const fy = (l.floorAt ? l.floorAt(m.position.x, m.position.z) : 0) + 0.07;
  if (m.position.y < fy) {
    m.position.y = fy;
    l.v.y *= -0.3;
    l.v.x *= 0.6;
    l.v.z *= 0.6;
    l.w.multiplyScalar(0.5);
    if (Math.abs(l.v.y) < 0.4) l.rest = true;
  }
}

/** Triangle count of the shared body (after prepareZombieMeshes). */
export function zombieMeshStats() {
  return shared ? { tris: shared.tris, verts: shared.data.positions.length / 3 } : null;
}
