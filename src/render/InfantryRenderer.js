// Thousands of soldiers in a handful of draw calls. The soldier mesh is built
// in a standing pose with every vertex tagged by bone (pelvis, torso, arms +
// weapon, thighs, shins), material and weapon variant. A per-instance set of
// animation parameters drives a procedural skeleton in the vertex shader:
// walk/run cycles, crouch, prone, aiming, recoil, parachute and death falls.
// Faction camouflage is generated in the fragment shader.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash01 } from '../core/rng.js';

// Material ids.
export const M_UNIFORM = 0;
export const M_GEAR = 1;
export const M_SKIN = 2;
export const M_HELMET = 3;
export const M_BOOT = 4;
export const M_METAL = 5;
export const M_FURN = 6;
export const M_TUBE = 7;

// Weapon variants.
export const WEAPON_VARIANT = { rifle: 0, mg: 1, sniper: 2, launcher: 3, tube: 4, pistol: 5 };
export const ROLE_WEAPON = { rifleman: 0, leader: 0, grenadier: 0, mg: 1, sniper: 2, at: 3, atgm: 4, manpads: 4, drone_op: 0, crew: 5, pilot: 5 };

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export function tag(geo, bone, mat, weap = -1) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count;
  const part = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    part[i * 3] = bone;
    part[i * 3 + 1] = mat;
    part[i * 3 + 2] = weap;
  }
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 3));
  return geo;
}

export function box(w, h, d, x, y, z, bone, mat, weap = -1, rotX = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  return tag(g, bone, mat, weap);
}

// Tapered box: bottom (w0, d0) at y0, top (w1, d1) at y1.
export function taper(w0, d0, w1, d1, y0, y1, x, z, bone, mat) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setXYZ(i, p.getX(i) * (top ? w1 : w0) + x, top ? y1 : y0, p.getZ(i) * (top ? d1 : d0) + z);
  }
  g.computeVertexNormals();
  return tag(g, bone, mat);
}

export function limb(a, b, r0, r1, seg, bone, mat, weap = -1) {
  const dir = _v.subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  _q.setFromUnitVectors(_up, dir.normalize());
  g.applyQuaternion(_q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return tag(g, bone, mat, weap);
}

export function ball(r, x, y, z, detail, bone, mat, sy = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return tag(g, bone, mat);
}

export function dome(r, x, y, z, bone, mat, segs) {
  const g = new THREE.SphereGeometry(r, segs, Math.max(3, segs >> 1), 0, Math.PI * 2, 0, Math.PI * 0.55);
  g.scale(1, 0.82, 1.05);
  g.translate(x, y, z);
  return tag(g, bone, mat);
}

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Weapon primitives in the soldier's model space (held at the aim pose).
export function weaponShapes(v, lod = 0) {
  const s = lod === 0 ? 7 : 4;
  const wx = -0.085;
  const parts = [];
  if (v === 0) {
    // Assault rifle.
    parts.push(box(0.055, 0.1, 0.42, wx, 1.33, 0.32, 2, M_METAL, 0));
    parts.push(limb(V(wx, 1.345, 0.52), V(wx, 1.345, 0.84), 0.013, 0.011, 5, 2, M_METAL, 0));
    parts.push(box(0.05, 0.1, 0.2, wx, 1.31, 0.03, 2, M_FURN, 0));
    parts.push(box(0.04, 0.14, 0.06, wx, 1.22, 0.33, 2, M_METAL, 0, 0.25));
    if (lod === 0) parts.push(box(0.035, 0.05, 0.11, wx, 1.405, 0.28, 2, M_METAL, 0));
  } else if (v === 1) {
    // Machine gun.
    parts.push(box(0.075, 0.12, 0.5, wx, 1.33, 0.34, 2, M_METAL, 1));
    parts.push(limb(V(wx, 1.35, 0.58), V(wx, 1.35, 1.0), 0.019, 0.017, 6, 2, M_METAL, 1));
    parts.push(box(0.1, 0.11, 0.13, wx - 0.03, 1.22, 0.32, 2, M_FURN, 1));
    parts.push(box(0.055, 0.11, 0.22, wx, 1.31, 0.02, 2, M_METAL, 1));
  } else if (v === 2) {
    // Sniper rifle.
    parts.push(box(0.055, 0.1, 0.55, wx, 1.33, 0.36, 2, M_FURN, 2));
    parts.push(limb(V(wx, 1.345, 0.63), V(wx, 1.345, 1.08), 0.012, 0.011, 5, 2, M_METAL, 2));
    parts.push(limb(V(wx, 1.42, 0.2), V(wx, 1.42, 0.5), 0.024, 0.024, 6, 2, M_METAL, 2));
  } else if (v === 3) {
    // Rocket launcher on the shoulder.
    parts.push(limb(V(-0.13, 1.5, -0.38), V(-0.13, 1.5, 0.62), 0.042, 0.042, s, 2, M_TUBE, 3));
    parts.push(ball(0.07, -0.13, 1.5, 0.72, 1, 2, M_TUBE, 1.0));
    parts.push(box(0.03, 0.1, 0.04, -0.13, 1.42, 0.2, 2, M_METAL, 3));
  } else if (v === 4) {
    // Heavy launch tube (ATGM / MANPADS).
    parts.push(limb(V(-0.14, 1.52, -0.55), V(-0.14, 1.52, 0.72), 0.07, 0.07, s, 2, M_TUBE, 4));
    parts.push(box(0.16, 0.14, 0.2, -0.02, 1.47, 0.15, 2, M_METAL, 4));
  } else {
    // Pistol in hand.
    parts.push(box(0.035, 0.1, 0.16, -0.1, 1.31, 0.27, 2, M_METAL, 5));
  }
  return parts;
}

// Bones: 0 pelvis, 1 torso+head, 2 arms+weapon, 3 L thigh, 4 L shin, 5 R thigh, 6 R shin.
export function buildSoldierGeometry(lod = 0) {
  const s = lod === 0 ? 7 : 4;
  const parts = [];
  // Lower body.
  parts.push(box(0.34, 0.2, 0.22, 0, 0.95, 0, 0, M_UNIFORM));
  parts.push(box(0.37, 0.06, 0.25, 0, 1.03, 0, 0, M_GEAR));
  // Torso, plate carrier, backpack, neck, head, helmet.
  parts.push(taper(0.33, 0.21, 0.41, 0.24, 1.0, 1.47, 0, 0, 1, M_UNIFORM));
  parts.push(box(0.39, 0.34, 0.3, 0, 1.27, 0.0, 1, M_GEAR));
  if (lod === 0) {
    parts.push(box(0.09, 0.11, 0.06, -0.12, 1.15, 0.17, 1, M_GEAR));
    parts.push(box(0.09, 0.11, 0.06, 0, 1.15, 0.17, 1, M_GEAR));
    parts.push(box(0.09, 0.11, 0.06, 0.12, 1.15, 0.17, 1, M_GEAR));
    parts.push(box(0.1, 0.12, 0.06, 0.16, 1.32, 0.16, 1, M_GEAR));
  }
  parts.push(box(0.3, 0.4, 0.17, 0, 1.28, -0.22, 1, M_GEAR));
  parts.push(limb(V(0, 1.47, 0), V(0, 1.57, 0.01), 0.052, 0.048, 6, 1, M_SKIN));
  parts.push(ball(0.105, 0, 1.655, 0.012, lod === 0 ? 1 : 0, 1, M_SKIN, 1.08));
  parts.push(dome(0.132, 0, 1.675, 0.0, 1, M_HELMET, lod === 0 ? 10 : 6));
  if (lod === 0) parts.push(box(0.09, 0.03, 0.03, 0, 1.77, 0.11, 1, M_BOOT)); // NVG mount
  // Arms (pre-posed holding a long gun) and hands.
  const lSh = V(0.215, 1.43, 0.0);
  const lEl = V(0.19, 1.2, 0.17);
  const lHa = V(0.05, 1.31, 0.44);
  const rSh = V(-0.215, 1.43, 0.0);
  const rEl = V(-0.25, 1.18, 0.07);
  const rHa = V(-0.1, 1.29, 0.2);
  parts.push(limb(lSh, lEl, 0.058, 0.05, s, 2, M_UNIFORM));
  parts.push(limb(lEl, lHa, 0.05, 0.043, s, 2, M_UNIFORM));
  parts.push(limb(rSh, rEl, 0.058, 0.05, s, 2, M_UNIFORM));
  parts.push(limb(rEl, rHa, 0.05, 0.043, s, 2, M_UNIFORM));
  parts.push(ball(0.048, lHa.x, lHa.y - 0.01, lHa.z, 0, 2, M_BOOT));
  parts.push(ball(0.048, rHa.x, rHa.y - 0.01, rHa.z, 0, 2, M_BOOT));
  // Weapons (only the instance's variant is shown).
  for (let v = 0; v < 6; v++) parts.push(...weaponShapes(v, lod));
  // Legs.
  for (const side of [1, -1]) {
    const x = 0.1 * side;
    const bt = side > 0 ? 3 : 5;
    const bs = side > 0 ? 4 : 6;
    parts.push(limb(V(x, 0.95, 0), V(x, 0.5, 0.02), 0.088, 0.068, s, bt, M_UNIFORM));
    parts.push(limb(V(x, 0.5, 0.02), V(x, 0.1, 0.0), 0.062, 0.05, s, bs, M_UNIFORM));
    if (lod === 0) parts.push(box(0.11, 0.1, 0.06, x, 0.5, 0.075, bs, M_GEAR));
    parts.push(box(0.11, 0.12, 0.27, x, 0.06, 0.045, bs, M_BOOT));
  }
  const geo = mergeGeometries(parts, false);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = 2;
  return geo;
}

const ANIM_GLSL = /* glsl */ `
attribute vec3 aPart;
attribute vec4 aAnim;   // phase, move (0 idle..1 walk..2.5 sprint), stance (0..2), aim pitch
attribute vec4 aAnim2;  // aim blend, recoil, time since death (0 = alive), fall direction (+-1, fraction = variant)
attribute vec4 aVar;    // weapon variant, parachute, lost legs mask, seed
varying float vMat;
varying vec3 vObj;
varying float vSeed;

mat3 rotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a); float s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

const vec3 HIP_L = vec3(0.1, 0.93, 0.0);
const vec3 HIP_R = vec3(-0.1, 0.93, 0.0);
const vec3 KNEE_L = vec3(0.1, 0.5, 0.02);
const vec3 KNEE_R = vec3(-0.1, 0.5, 0.02);
const vec3 WAIST = vec3(0.0, 1.0, 0.0);
const vec3 SHOULDER = vec3(0.0, 1.42, 0.0);

void animateSoldier(vec3 p, out vec3 outP, out mat3 outR) {
  float bone = aPart.x;
  float ph = aAnim.x;
  float mv = aAnim.y;
  float st = aAnim.z;
  float aimP = aAnim.w;
  float aimB = aAnim2.x;
  float rec = aAnim2.y;
  float dT = aAnim2.z;
  float fdir = aAnim2.w;
  float crouch = clamp(st, 0.0, 1.0);
  float prone = clamp(st - 1.0, 0.0, 1.0);
  float upright = 1.0 - prone;
  float dead = step(0.0001, dT);
  float death = dead * smoothstep(0.0, 0.7, dT);
  float alive = 1.0 - dead;
  float hang = aVar.y * alive;
  float walk = clamp(mv, 0.0, 1.0) * alive;
  float run = clamp(mv - 1.0, 0.0, 1.5) * alive;
  float crawl = prone * clamp(mv * 2.0, 0.0, 1.0) * alive;
  float cr = crouch * upright * alive;

  // Hide weapon variants other than this instance's, and lost legs
  // (aVar.z bits: 1 left leg, 2 left shin, 4 right leg, 8 right shin).
  int sev = int(aVar.z + 0.5);
  bool lost = (bone > 2.5 && bone < 3.5 && (sev & 1) != 0) || (bone > 3.5 && bone < 4.5 && (sev & 3) != 0)
           || (bone > 4.5 && bone < 5.5 && (sev & 4) != 0) || (bone > 5.5 && (sev & 12) != 0);
  if ((aPart.z > -0.5 && abs(aPart.z - aVar.x) > 0.5) || lost) {
    outP = vec3(0.0);
    outR = mat3(1.0);
    return;
  }

  float amp = (0.42 * walk + 0.32 * run) * upright * (1.0 - hang);
  float swing = sin(ph) * amp + sin(ph) * 0.2 * crawl;
  float kneeAmp = (0.55 * walk + 0.6 * run) * upright * (1.0 - hang);
  float kL = max(0.0, sin(ph + 1.7)) * kneeAmp + cr * 2.05 + hang * 0.55 + 0.3 * crawl * max(0.0, sin(ph)) + death * 0.15;
  float kR = max(0.0, sin(ph + 4.84)) * kneeAmp + cr * 2.05 + hang * 0.42 + 0.3 * crawl * max(0.0, -sin(ph)) + death * 0.35;
  float tL = -swing - cr * 1.15 - hang * 0.35;
  float tR = swing - cr * 1.15 - hang * 0.12;
  float spread = prone * 0.1 + death * 0.12;
  float lean = ((0.1 * walk + 0.24 * run + 0.28 * cr) - aimP * 0.4 * alive) * upright;
  float bob = (abs(sin(ph)) * 0.035 * walk + abs(sin(ph)) * 0.06 * run) * upright;
  float armA = mix(0.55 + 0.3 * clamp(run, 0.0, 1.0), 0.0, aimB) * upright * (1.0 - hang)
             - aimP * 0.6 * alive * upright
             - rec * 0.12
             - prone * 1.5708 * alive
             - hang * 2.55
             + dead * 0.85;

  mat3 R = mat3(1.0);
  if (bone > 2.5) {
    bool left = bone < 4.5;
    bool shin = (bone > 3.5 && bone < 4.5) || bone > 5.5;
    vec3 hip = left ? HIP_L : HIP_R;
    vec3 knee = left ? KNEE_L : KNEE_R;
    if (shin) {
      mat3 K = rotX(left ? kL : kR);
      p = knee + K * (p - knee);
      R = K * R;
    }
    mat3 H = rotZ(left ? spread : -spread) * rotX(left ? tL : tR);
    p = hip + H * (p - hip);
    R = H * R;
  } else if (bone > 0.5) {
    if (bone > 1.5) {
      mat3 A = rotX(armA);
      p = SHOULDER + A * (p - SHOULDER) + vec3(0.0, 0.0, -0.05 * rec);
      R = A * R;
    }
    mat3 L = rotX(lean);
    p = WAIST + L * (p - WAIST);
    R = L * R;
  }
  p.y += -0.4 * cr + bob;

  // Whole body: prone or a death fall, pivoting at the feet.
  float fd = prone > 0.5 ? 1.0 : (fdir >= 0.0 ? 1.0 : -1.0);
  float bodyA = mix(prone * 1.5708, fd * 1.5708, death);
  mat3 B = rotY(dead * (fract(abs(fdir)) - 0.5) * 0.9) * rotX(bodyA);
  p = B * p;
  R = B * R;
  float lie = max(prone, death);
  p.z -= 0.85 * lie * (bodyA >= 0.0 ? 1.0 : -1.0);
  p.y += 0.13 * lie;
  outP = p;
  outR = R;
}
`;

const CAMO_GLSL = /* glsl */ `
uniform vec3 uCamo0;
uniform vec3 uCamo1;
uniform vec3 uCamo2;
uniform vec3 uCamo3;
uniform vec3 uGear;
uniform vec3 uHelmet;
uniform vec3 uSkinA;
uniform vec3 uSkinB;
uniform vec3 uBoot;
uniform vec3 uMetal;
uniform vec3 uFurn;
uniform vec3 uTube;
uniform float uHelmetCamo;
varying float vMat;
varying vec3 vObj;
varying float vSeed;
float h31(vec3 p) { return fract(sin(dot(p, vec3(17.13, 61.71, 12.97))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
vec3 camo(vec3 p) {
  float n = n3(p * 6.5) * 0.65 + n3(p * 14.0 + 3.1) * 0.35;
  vec3 c = mix(uCamo0, uCamo1, smoothstep(0.43, 0.47, n));
  c = mix(c, uCamo2, smoothstep(0.6, 0.63, n));
  c = mix(c, uCamo3, smoothstep(0.74, 0.77, n3(p * 10.0 + 7.3)));
  return c;
}
`;

// Surface colour by material id (camouflage, gear, skin...), with optional
// blood staining.
const COLOR_GLSL = /* glsl */ `
{
  float m = floor(vMat + 0.5);
  vec3 base;
  if (m < 0.5) base = camo(vObj);
  else if (m < 1.5) base = uGear * (0.85 + 0.3 * n3(vObj * 20.0));
  else if (m < 2.5) base = mix(uSkinA, uSkinB, fract(vSeed * 7.31));
  else if (m < 3.5) base = uHelmetCamo > 0.5 ? camo(vObj * 1.3) : uHelmet;
  else if (m < 4.5) base = uBoot;
  else if (m < 5.5) base = uMetal;
  else if (m < 6.5) base = uFurn;
  else base = uTube;
  float stain = vBlood * smoothstep(0.38, 0.62, n3(vObj * 7.0 + 5.0) * 0.7 + vBlood * 0.45);
  base = mix(base, vec3(0.16, 0.012, 0.008), clamp(stain, 0.0, 0.92) * step(m, 4.5));
  diffuseColor.rgb = base;
}
`;

function setColorUniforms(u, f) {
  const col = (h) => ({ value: new THREE.Color(h) });
  u.uCamo0 = col(f.camo[0]);
  u.uCamo1 = col(f.camo[1]);
  u.uCamo2 = col(f.camo[2]);
  u.uCamo3 = col(f.camo[3]);
  u.uGear = col(f.gear);
  u.uHelmet = col(f.helmet);
  u.uSkinA = col(0xd9a988);
  u.uSkinB = col(0x7a5038);
  u.uBoot = col(0x2b2620);
  u.uMetal = col(0x1e1f20);
  u.uFurn = col(0x3a3328);
  u.uTube = col(0x4e5638);
  u.uHelmetCamo = { value: f.helmetCamo };
}

export const FACTION_UNIFORMS = [
  // Coalition: multicam-style tan/green/brown, coyote gear.
  { camo: [0xa59672, 0x7d7150, 0x5f4c36, 0xc4b591], gear: 0x8a7a57, helmet: 0x8e8063, helmetCamo: 1 },
  // Federation: olive/green "flora" style, olive drab gear.
  { camo: [0x5d6541, 0x3f4a2c, 0x56483a, 0x7b7f57], gear: 0x4d5538, helmet: 0x4b5536, helmetCamo: 0 },
];

function makeMaterial(faction, depth = false) {
  const f = FACTION_UNIFORMS[faction];
  const mat = depth ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }) : new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = ANIM_GLSL + '\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'void main() {\n  vec3 animPos;\n  mat3 animRot;\n  animateSoldier(position, animPos, animRot);\n  vMat = aPart.y;\n  vObj = position + vec3(aVar.w * 37.0, aVar.w * 11.0, 0.0);\n  vSeed = aVar.w;',
    );
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = animRot * normal;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = animPos;');
    if (!depth) {
      setColorUniforms(shader.uniforms, f);
      shader.fragmentShader = CAMO_GLSL + '\nconst float vBlood = 0.0;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + COLOR_GLSL);
    } else {
      // Depth shader also needs the varyings declared (unused).
      shader.fragmentShader = 'varying float vMat;\nvarying vec3 vObj;\nvarying float vSeed;\n' + shader.fragmentShader;
    }
  };
  mat.customProgramCacheKey = () => `soldier-${faction}-${depth ? 'd' : 'c'}`;
  return mat;
}

// Rigid body parts (ragdolls): the same colouring without the skeleton, with
// a per-instance seed and blood stain in aRag.
export function makeRagdollMaterial(faction) {
  const f = FACTION_UNIFORMS[faction];
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute vec3 aPart;\nattribute vec2 aRag;\nvarying float vMat;\nvarying vec3 vObj;\nvarying float vSeed;\nvarying float vBlood;\n' + shader.vertexShader.replace(
      'void main() {',
      'void main() {\n  vMat = aPart.y;\n  vObj = position + vec3(aRag.x * 37.0, aRag.x * 11.0, 0.0);\n  vSeed = aRag.x;\n  vBlood = aRag.y;',
    );
    setColorUniforms(shader.uniforms, f);
    shader.fragmentShader = CAMO_GLSL + '\nvarying float vBlood;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + COLOR_GLSL);
  };
  mat.customProgramCacheKey = () => `ragdoll-${faction}`;
  return mat;
}

class SoldierBatch {
  constructor(scene, geo, material, depthMaterial, max, shadows) {
    this.scene = scene;
    this.base = geo;
    this.material = material;
    this.depthMaterial = depthMaterial;
    this.shadows = shadows;
    this.mesh = null;
    this.count = 0;
    this.alloc(max);
  }

  // (Re)allocate for n soldiers, keeping what this frame already wrote.
  alloc(n) {
    const old = this.mesh;
    this.max = n;
    this.geo = this.base.clone();
    const mesh = new THREE.InstancedMesh(this.geo, this.material, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = this.shadows;
    if (this.depthMaterial) mesh.customDepthMaterial = this.depthMaterial;
    const prev = old ? [this.anim, this.anim2, this.vars] : null;
    this.anim = new Float32Array(n * 4);
    this.anim2 = new Float32Array(n * 4);
    this.vars = new Float32Array(n * 4);
    for (const [name, arr] of [['aAnim', this.anim], ['aAnim2', this.anim2], ['aVar', this.vars]]) {
      const a = new THREE.InstancedBufferAttribute(arr, 4);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, a);
    }
    if (old) {
      const k = this.count;
      mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, k * 16));
      this.anim.set(prev[0].subarray(0, k * 4));
      this.anim2.set(prev[1].subarray(0, k * 4));
      this.vars.set(prev[2].subarray(0, k * 4));
      this.scene.remove(old);
      old.geometry.dispose();
      old.dispose();
    }
    this.mesh = mesh;
    this.scene.add(mesh);
  }

  begin() {
    this.count = 0;
  }

  push(m, a, a2, v) {
    if (this.count >= this.max) this.alloc(this.max * 2);
    const i = this.count++;
    this.mesh.instanceMatrix.array.set(m, i * 16);
    this.anim.set(a, i * 4);
    this.anim2.set(a2, i * 4);
    this.vars.set(v, i * 4);
    return true;
  }

  end() {
    const n = this.count;
    this.mesh.count = n;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, n * 16);
    im.needsUpdate = true;
    for (const name of ['aAnim', 'aAnim2', 'aVar']) {
      const a = this.geo.getAttribute(name);
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
  }
}

// Faint faction-coloured rings on the ground under living soldiers. They grow
// and strengthen with distance so troops stay readable from far away.
class SoldierRings {
  constructor(scene, max) {
    const g = new THREE.PlaneGeometry(2, 2);
    g.rotateX(-Math.PI / 2);
    this.alpha = new Float32Array(max);
    this.aAlpha = new THREE.InstancedBufferAttribute(this.alpha, 1);
    this.aAlpha.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAlpha', this.aAlpha);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float aAlpha;\nvarying float vA;\nvarying vec2 vR;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aAlpha;\nvR = position.xz;');
      shader.fragmentShader = 'varying float vA;\nvarying vec2 vR;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float r = length(vR);
        float ring = smoothstep(0.6, 0.74, r) * (1.0 - smoothstep(0.86, 1.0, r));
        float fill = (1.0 - smoothstep(0.5, 0.74, r)) * 0.2;
        diffuseColor.a *= vA * max(ring, fill);`,
      );
    };
    mat.customProgramCacheKey = () => 'soldier-rings';
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.colors = [new THREE.Color(0.32, 0.64, 1.0), new THREE.Color(1.0, 0.34, 0.28)];
    this.max = max;
    this.count = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.n = new THREE.Vector3();
  }

  push(u, d, terrain) {
    if (this.count >= this.max || d < 25) return;
    const i = this.count++;
    const r = 0.6 + d * 0.0042;
    if (d > 45) {
      terrain.normalAt(u.pos.x, u.pos.z, this.n);
      this.q.setFromUnitVectors(_up, this.n);
    } else this.q.identity();
    this.p.set(u.pos.x, u.pos.y + 0.06 + r * 0.03, u.pos.z);
    this.s.set(r, 1, r);
    this.m.compose(this.p, this.q, this.s);
    this.m.toArray(this.mesh.instanceMatrix.array, i * 16);
    const c = this.colors[u.faction];
    const ca = this.mesh.instanceColor.array;
    ca[i * 3] = c.r;
    ca[i * 3 + 1] = c.g;
    ca[i * 3 + 2] = c.b;
    this.alpha[i] = 0.1 + Math.min(1, (d - 25) / 280) * 0.5;
  }

  end() {
    const n = this.count;
    this.mesh.count = n;
    for (const a of [this.mesh.instanceMatrix, this.mesh.instanceColor, this.aAlpha]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
    this.count = 0;
  }
}

const _m = new Float32Array(16);
const _a = new Float32Array(4);
const _a2 = new Float32Array(4);
const _vv = new Float32Array(4);
const _sphere = new THREE.Sphere();

export class InfantryRenderer {
  constructor(scene, quality, parachuteGeo = null, maxSoldiers = 4096) {
    this.scene = scene;
    this.quality = quality;
    const g0 = buildSoldierGeometry(0);
    const g1 = buildSoldierGeometry(1);
    this.batches = [];
    for (let f = 0; f < 2; f++) {
      const mat = makeMaterial(f);
      const dmat = makeMaterial(f, true);
      const near = new SoldierBatch(scene, g0, mat, dmat, 1024, !!quality.shadows);
      const far = new SoldierBatch(scene, g1, mat, null, maxSoldiers, false);
      this.batches.push([near, far]);
    }
    this.lodDist = 140 * (quality.unitLod ?? 1);
    this.maxDist = 1700;
    // Parachute canopies.
    const pg = parachuteGeo || fallbackCanopy();
    this.chutes = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: !!pg.getAttribute('color'), side: THREE.DoubleSide }), 256);
    this.chutes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chutes.frustumCulled = false;
    this.chutes.count = 0;
    scene.add(this.chutes);
    this.chuteObj = new THREE.Object3D();
    this.visibleCount = 0;
    this.rings = new SoldierRings(scene, 12000);
    this.showRings = true;
    this.gore = true;
    this.hide = null; // the soldier seen through his own eyes
  }

  update(world, camera, frustum, dt) {
    for (const [n, f] of this.batches) {
      n.begin();
      f.begin();
    }
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const lod2 = this.lodDist * this.lodDist;
    const max2 = this.maxDist * this.maxDist;
    let chutes = 0;
    let vis = 0;
    const terrain = world.terrain;
    const rings = this.showRings ? this.rings : null;
    const draw = (u) => {
      // Fallen soldiers near the camera are drawn by the ragdoll system.
      if (u.hidden || u.removed || u._rd || u === this.hide) return;
      const p = u.pos;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > max2) return;
      _sphere.center.set(p.x, p.y + 0.9, p.z);
      _sphere.radius = 1.3;
      if (!frustum.intersectsSphere(_sphere)) return;
      vis++;
      const fallen = !u.alive || !!u.downed;
      if (rings && !fallen && !u.mounted) rings.push(u, Math.sqrt(d2), terrain);
      const seed = hash01(u.id, 7);
      const sc = 0.94 + seed * 0.1;
      const c = Math.cos(u.yaw) * sc;
      const s = Math.sin(u.yaw) * sc;
      _m[0] = c;
      _m[1] = 0;
      _m[2] = -s;
      _m[3] = 0;
      _m[4] = 0;
      _m[5] = sc;
      _m[6] = 0;
      _m[7] = 0;
      _m[8] = s;
      _m[9] = 0;
      _m[10] = c;
      _m[11] = 0;
      _m[12] = p.x;
      _m[13] = p.y;
      _m[14] = p.z;
      _m[15] = 1;
      // Animation parameters.
      const speed = u.speed || 0;
      const move = speed < 2.2 ? speed / 1.5 : 1 + (speed - 2.2) / 1.6;
      const aimT = u.aiming && !fallen ? 1 : 0;
      u._aimB = (u._aimB ?? 0) + (aimT - (u._aimB ?? 0)) * Math.min(1, dt * 6);
      _a[0] = u.animPhase;
      _a[1] = Math.min(2.5, move);
      _a[2] = u.stanceT;
      _a[3] = u.aiming ? u.aimPitch : 0;
      _a2[0] = u._aimB;
      _a2[1] = Math.max(0, 1 - u.fireT / 0.12);
      _a2[2] = fallen ? Math.max(0.0002, u.deadT) : 0;
      _a2[3] = (u.fallDir >= 0 ? 1 : -1) * (1 + hash01(u.id, 3) * 0.9);
      _vv[0] = ROLE_WEAPON[u.def.role] ?? 0;
      _vv[1] = u.para && u.para.phase === 'canopy' ? 1 : 0;
      _vv[2] = this.gore && u.severed ? (u.severed & 4 ? 1 : 0) | (u.severed & 16 ? 2 : 0) | (u.severed & 8 ? 4 : 0) | (u.severed & 32 ? 8 : 0) : 0;
      _vv[3] = seed;
      const [near, far] = this.batches[u.faction];
      (d2 < lod2 ? near : far).push(_m, _a, _a2, _vv);
      if (u.para && u.para.phase === 'canopy' && chutes < 256) {
        const o = this.chuteObj;
        o.position.set(p.x, p.y + 1.75, p.z);
        o.rotation.set(0, u.yaw, 0);
        const open = Math.min(1, u.para.t / 1.2);
        o.scale.set(0.3 + open * 0.7, 0.5 + open * 0.5, 0.3 + open * 0.7);
        o.updateMatrix();
        this.chutes.setMatrixAt(chutes++, o.matrix);
      }
    };
    for (const u of world.units) if (u.cat === 'inf') draw(u);
    for (const u of world.dead) if (u.cat === 'inf') draw(u);
    for (const [n, f] of this.batches) {
      n.end();
      f.end();
    }
    this.chutes.count = chutes;
    if (chutes) this.chutes.instanceMatrix.needsUpdate = true;
    this.rings.end();
    this.rings.mesh.visible = this.showRings;
    this.visibleCount = vis;
  }
}

function fallbackCanopy() {
  const g = new THREE.SphereGeometry(3.7, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
  g.translate(0, 3.6, 0);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(0x6b7048);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
