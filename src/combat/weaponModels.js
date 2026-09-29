// Procedural weapon & item models. Each builder returns a THREE.Group oriented
// with the barrel along -Z, grip near the origin. userData.muzzle marks the
// muzzle point, userData.eject the ejection port, userData.mag the magazine
// (animated during reloads), userData.pump / slide / bolt for action animations.
//
// Models are built from bevelled side profiles (extruded outlines with
// fillets), cross-section extrusions, rounded boxes and lathed parts, then
// merged per material (one draw call per material per moving part). The
// materials add procedural wear in the shader: edges (found from screen-space
// normal curvature) rub through to bare metal / lighter polymer, low-frequency
// smudges vary the roughness, and polymer grips get a stippled bump.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getTexture } from '../render/textures.js';

// ---------------------------------------------------------------- materials --
const WEAR_PARS = /* glsl */ `
varying vec3 vWObj;
uniform float uWear, uWearRough, uWearMetal, uGrain, uGrainScale;
uniform vec3 uWearCol;
float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;
const WEAR_FRAG = /* glsl */ `
{
  vec3 op = vWObj;
  float n1 = wNoise(op * 34.0), n2 = wNoise(op * 150.0 + 7.1), n3 = wNoise(op * 8.0 + 3.3);
  float dp = max(length(fwidth(vViewPosition)), 1e-6);
  float curv = length(fwidth(vNormal)) / dp;
  float edge = smoothstep(110.0, 460.0, curv);
  float wear = clamp(edge * (0.35 + 1.2 * n2) * uWear + max(n3 * n1 - 0.6, 0.0) * uWear * 0.9, 0.0, 1.0);
  diffuseColor.rgb *= 0.88 + 0.24 * n1;
  roughnessFactor = clamp(roughnessFactor * (0.8 + 0.4 * mix(n1, n3, 0.6)), 0.04, 1.0);
  roughnessFactor = mix(roughnessFactor, uWearRough, wear);
  metalnessFactor = mix(metalnessFactor, uWearMetal, wear);
  diffuseColor.rgb = mix(diffuseColor.rgb, uWearCol, wear);
  if (uGrain > 0.0) {
    float fade = 1.0 - smoothstep(0.25, 0.9, dp * uGrainScale);
    if (fade > 0.0) {
      float h = wNoise(op * uGrainScale) + 0.5 * wNoise(op * uGrainScale * 2.3 + 1.7);
      vec2 dh = vec2(dFdx(h), dFdy(h)) * uGrain * fade;
      vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
      vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
      float det = dot(sx, r1) * faceDirection;
      vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
      vec3 nn = abs(det) * normal - grad;
      // guard: degenerate derivatives must never produce NaN (bloom spreads it)
      if (dot(nn, nn) > 1e-24 && abs(det) > 1e-14) normal = normalize(nn);
    }
  }
  if (any(isnan(normal)) || any(isinf(normal))) normal = vec3(0.0, 0.0, 1.0);
}
`;
function wearMat(o) {
  const m = new THREE.MeshStandardMaterial({ color: o.color, metalness: o.metal ?? 0, roughness: o.rough ?? 0.5, map: o.map || null });
  m.userData.envK = o.env ?? 0.6;
  const U = {
    uWear: { value: o.wear ?? 0.4 }, uWearCol: { value: new THREE.Color(o.wearCol ?? o.color) }, uWearRough: { value: o.wearRough ?? 0.3 },
    uWearMetal: { value: o.wearMetal ?? o.metal ?? 0 }, uGrain: { value: o.grain ?? 0 }, uGrainScale: { value: o.grainScale ?? 900 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + WEAR_PARS)
      .replace('#include <lights_physical_fragment>', WEAR_FRAG + '\n#include <lights_physical_fragment>');
  };
  m.customProgramCacheKey = () => 'wpnwear3';
  return m;
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const wood = getTexture('wood', { color: 0x6a4424, seed: 301, size: 256 });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MATS = {
    // guns
    blued: wearMat({ color: 0x26282b, metal: 0.8, rough: 0.36, wear: 0.55, wearCol: 0x8a9095, wearRough: 0.2, wearMetal: 1, grain: 0.00004, grainScale: 1500 }),
    parker: wearMat({ color: 0x2e3032, metal: 0.55, rough: 0.56, wear: 0.4, wearCol: 0x7d8186, wearRough: 0.26, wearMetal: 1, grain: 0.00005, grainScale: 1700 }),
    steel: wearMat({ color: 0x80858b, metal: 1, rough: 0.3, wear: 0.25, wearCol: 0xb8bcc0, wearRough: 0.16, wearMetal: 1, env: 0.8 }),
    stainless: wearMat({ color: 0xa6aaae, metal: 1, rough: 0.36, wear: 0.2, wearCol: 0xd0d3d6, wearRough: 0.18, wearMetal: 1, grain: 0.00003, grainScale: 2400, env: 0.8 }),
    alu: wearMat({ color: 0x1e2022, metal: 0.45, rough: 0.46, wear: 0.6, wearCol: 0xa2a6ab, wearRough: 0.28, wearMetal: 1 }),
    poly: wearMat({ color: 0x19191b, metal: 0, rough: 0.6, wear: 0.35, wearCol: 0x3c3e41, wearRough: 0.4, wearMetal: 0, grain: 0.00003, grainScale: 900 }),
    polyGrip: wearMat({ color: 0x151617, metal: 0, rough: 0.78, wear: 0.25, wearCol: 0x34363a, wearRough: 0.5, wearMetal: 0, grain: 0.00024, grainScale: 1300 }),
    fde: wearMat({ color: 0x7a6a4c, metal: 0, rough: 0.62, wear: 0.45, wearCol: 0xa6977a, wearRough: 0.48, wearMetal: 0, grain: 0.00004, grainScale: 900 }),
    od: wearMat({ color: 0x3a3e2c, metal: 0.1, rough: 0.6, wear: 0.45, wearCol: 0x70735f, wearRough: 0.45, wearMetal: 0.2, grain: 0.00004, grainScale: 900 }),
    wood: wearMat({ color: 0xc09070, map: wood.map, metal: 0, rough: 0.5, wear: 0.35, wearCol: 0xa57a50, wearRough: 0.42, wearMetal: 0 }),
    rubber: wearMat({ color: 0x101011, metal: 0, rough: 0.9, wear: 0.1, wearCol: 0x2a2a2b, wearRough: 0.8, grain: 0.00012, grainScale: 1600 }),
    // polished but not mirror: brushed nickel sheen (the old 0.1 roughness flared white under the flashlight)
    chrome: wearMat({ color: 0xb9bdc2, metal: 1, rough: 0.27, wear: 0.25, wearCol: 0x9aa0a6, wearRough: 0.34, wearMetal: 1, env: 0.5, grain: 0.00003, grainScale: 2600 }),
    brass: wearMat({ color: 0xc49a4c, metal: 1, rough: 0.28, wear: 0.2, wearCol: 0xe3c68a, wearRough: 0.18, wearMetal: 1, env: 0.8 }),
    copper: wearMat({ color: 0xb06a40, metal: 1, rough: 0.3, wear: 0.1, wearCol: 0xd09060, env: 0.8 }),
    strap: wearMat({ color: 0x2c2e25, metal: 0, rough: 0.9, wear: 0.2, wearCol: 0x4a4c40, grain: 0.00016, grainScale: 1200 }),
    dark: std({ color: 0x060606, metalness: 0.3, roughness: 0.7 }),
    lens: std({ color: 0x0a1822, metalness: 0.6, roughness: 0.04, emissive: 0x04090e }),
    trit: new THREE.MeshBasicMaterial({ color: 0x3fae58 }),
    reddot: new THREE.MeshBasicMaterial({ color: 0xff3a22 }),
    paint: std({ color: 0xd8d6cc, roughness: 0.5 }),
    // melee / items
    red: wearMat({ color: 0x8c1611, metal: 0.25, rough: 0.42, wear: 0.9, wearCol: 0x6f7378, wearRough: 0.3, wearMetal: 1 }),
    yellow: wearMat({ color: 0xb08a18, metal: 0.2, rough: 0.5, wear: 0.7, wearCol: 0x5a5c60, wearRough: 0.35, wearMetal: 0.9 }),
    blade: wearMat({ color: 0x575b61, metal: 1, rough: 0.48, wear: 0.6, wearCol: 0xa9adb2, wearRough: 0.3, wearMetal: 1, env: 0.45, grain: 0.00004, grainScale: 2000 }),
    edge: wearMat({ color: 0x8a8f95, metal: 1, rough: 0.36, wear: 0.3, wearCol: 0xb4b8bc, wearRough: 0.3, wearMetal: 1, env: 0.45 }),
    // L4D2 melee / items
    katanaSteel: wearMat({ color: 0x7c8187, metal: 1, rough: 0.3, wear: 0.35, wearCol: 0xb0b5ba, wearRough: 0.24, wearMetal: 1, env: 0.55, grain: 0.00002, grainScale: 3000 }),
    hamon: wearMat({ color: 0xa4a9ae, metal: 1, rough: 0.4, wear: 0.2, wearCol: 0xc0c4c8, wearRough: 0.34, wearMetal: 1, env: 0.5 }),
    samegawa: wearMat({ color: 0xcfc6b0, metal: 0, rough: 0.8, wear: 0.4, wearCol: 0x8f8672, wearRough: 0.9, grain: 0.0005, grainScale: 2600 }),
    ito: wearMat({ color: 0x1b1a1f, metal: 0, rough: 0.85, wear: 0.3, wearCol: 0x3a3840, wearRough: 0.9, grain: 0.00025, grainScale: 1800 }),
    ironDark: wearMat({ color: 0x2a2724, metal: 0.8, rough: 0.62, wear: 0.5, wearCol: 0x6c655c, wearRough: 0.45, wearMetal: 1, grain: 0.0001, grainScale: 900 }),
    gilt: wearMat({ color: 0xa88a48, metal: 1, rough: 0.34, wear: 0.4, wearCol: 0xd4b878, wearRough: 0.24, wearMetal: 1, env: 0.6 }),
    ash: wearMat({ color: 0xd8b98c, map: null, metal: 0, rough: 0.55, wear: 0.55, wearCol: 0x8a6a44, wearRough: 0.7, grain: 0.00008, grainScale: 700 }),
    castIron: wearMat({ color: 0x232222, metal: 0.55, rough: 0.72, wear: 0.45, wearCol: 0x5e5a56, wearRough: 0.5, wearMetal: 0.9, grain: 0.00018, grainScale: 1500 }),
    gore: wearMat({ color: 0x3a0806, metal: 0.1, rough: 0.35, wear: 0.3, wearCol: 0x1c0403, wearRough: 0.5, grain: 0.0002, grainScale: 900 }),
    sawBody: wearMat({ color: 0xb6431a, metal: 0.05, rough: 0.5, wear: 0.55, wearCol: 0x5a2a1a, wearRough: 0.7, grain: 0.00005, grainScale: 1100 }),
    sawBar: wearMat({ color: 0x6d7176, metal: 0.9, rough: 0.46, wear: 0.6, wearCol: 0xaeb2b6, wearRough: 0.3, wearMetal: 1, env: 0.45, grain: 0.00005, grainScale: 1800 }),
    chain: wearMat({ color: 0x4a4c4f, metal: 1, rough: 0.42, wear: 0.7, wearCol: 0x9ca0a4, wearRough: 0.28, wearMetal: 1, env: 0.5 }),
    defibYellow: wearMat({ color: 0xd49a1a, metal: 0.05, rough: 0.45, wear: 0.45, wearCol: 0x7a6a50, wearRough: 0.7, grain: 0.00006, grainScale: 1000 }),
    greyPlastic: wearMat({ color: 0x4a4d52, metal: 0.05, rough: 0.55, wear: 0.35, wearCol: 0x7a7e84, wearRough: 0.6, grain: 0.00005, grainScale: 1000 }),
    padMetal: wearMat({ color: 0x9aa0a6, metal: 1, rough: 0.42, wear: 0.3, wearCol: 0x6a6e72, wearRough: 0.6, wearMetal: 1, env: 0.4 }),
    caseRed: wearMat({ color: 0x8e2616, metal: 0.05, rough: 0.55, wear: 0.5, wearCol: 0x4a2a22, wearRough: 0.75, grain: 0.00008, grainScale: 1100 }),
    caseGreen: wearMat({ color: 0x3f4a2a, metal: 0.05, rough: 0.6, wear: 0.5, wearCol: 0x6e7258, wearRough: 0.7, grain: 0.00008, grainScale: 1100 }),
    hazard: wearMat({ color: 0xd8b020, metal: 0.05, rough: 0.5, wear: 0.5, wearCol: 0x5a5040, wearRough: 0.7 }),
    screen: std({ color: 0x0a1a10, metalness: 0.2, roughness: 0.15, emissive: 0x1a6a2a, emissiveIntensity: 0.9 }),
    laserLens: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    gunDark: wearMat({ color: 0x1c1e21, metal: 0.7, rough: 0.45, wear: 0.4, wearCol: 0x7a7e84, wearRough: 0.3, wearMetal: 1 }),
    gun: wearMat({ color: 0x3c4046, metal: 0.85, rough: 0.38, wear: 0.4, wearCol: 0x9a9ea4, wearRough: 0.25, wearMetal: 1 }),
    polymer: wearMat({ color: 0x151617, metal: 0.05, rough: 0.62, wear: 0.3, wearCol: 0x38393b, wearRough: 0.45 }),
    polymerGreen: wearMat({ color: 0x3a3f2a, metal: 0.05, rough: 0.7, wear: 0.4, wearCol: 0x6a6e58, wearRough: 0.5 }),
    redShell: std({ color: 0x9a1a14, metalness: 0.1, roughness: 0.5 }),
    glassGreen: std({ color: 0x2e5a22, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.72, depthWrite: false }),
    glassClear: std({ color: 0xa8b8a0, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false }),
    fuel: std({ color: 0x8a6a1a, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.8 }),
    rag: wearMat({ color: 0x9a8a6a, rough: 1, wear: 0.5, wearCol: 0x4a3a2a, wearRough: 1, grain: 0.0003, grainScale: 700 }),
    tape: wearMat({ color: 0x6d6e6a, metal: 0.2, rough: 0.55, wear: 0.4, wearCol: 0x4a4a46, grain: 0.00008, grainScale: 800 }),
    white: wearMat({ color: 0xe0ded4, rough: 0.5, wear: 0.3, wearCol: 0xa8a498 }),
    orange: std({ color: 0xd06010, roughness: 0.4 }),
    medRed: wearMat({ color: 0xa81a18, rough: 0.7, wear: 0.4, wearCol: 0x6a1410, wearRough: 0.9, grain: 0.00018, grainScale: 900 }),
    pillOrange: std({ color: 0xc86818, roughness: 0.25, transparent: true, opacity: 0.9 }),
    label: std({ color: 0xe8e2cc, roughness: 0.7 }),
    bile: std({ color: 0x6a7a18, roughness: 0.2, transparent: true, opacity: 0.85 }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    led: new THREE.MeshBasicMaterial({ color: 0xff2010 }),
  };
  return MATS;
}

// ----------------------------------------------------------- geometry kit --
const CREASE = Math.cos(0.87);
// Smooth normals within the crease angle (bevels read round, faces stay flat).
function crease(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array, nv = p.length / 3;
  const fn = new Float32Array(nv); // face normal per face (3 floats per face)
  const nf = nv / 3;
  for (let f = 0; f < nf; f++) {
    const a = f * 9;
    const v1x = p[a + 6] - p[a + 3], v1y = p[a + 7] - p[a + 4], v1z = p[a + 8] - p[a + 5];
    const v2x = p[a] - p[a + 3], v2y = p[a + 1] - p[a + 4], v2z = p[a + 2] - p[a + 5];
    let x = v1y * v2z - v1z * v2y, y = v1z * v2x - v1x * v2z, z = v1x * v2y - v1y * v2x;
    const l = Math.hypot(x, y, z) || 1;
    fn[f * 3] = x / l; fn[f * 3 + 1] = y / l; fn[f * 3 + 2] = z / l;
  }
  const map = new Map();
  const keys = new Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = Math.round(p[i * 3] * 2e4) + ',' + Math.round(p[i * 3 + 1] * 2e4) + ',' + Math.round(p[i * 3 + 2] * 2e4);
    keys[i] = k;
    let a = map.get(k); if (!a) map.set(k, a = []);
    a.push(i / 3 | 0);
  }
  const out = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const f = i / 3 | 0, fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2];
    let x = 0, y = 0, z = 0;
    for (const o of map.get(keys[i])) {
      const ox = fn[o * 3], oy = fn[o * 3 + 1], oz = fn[o * 3 + 2];
      if (fx * ox + fy * oy + fz * oz >= CREASE) { x += ox; y += oy; z += oz; }
    }
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}
function tracePath(path, pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i], r = P[2] || 0;
    if (!r) { if (i === 0) path.moveTo(P[0], P[1]); else path.lineTo(P[0], P[1]); continue; }
    const A = pts[(i - 1 + n) % n], Bp = pts[(i + 1) % n];
    const ax = A[0] - P[0], ay = A[1] - P[1], bx = Bp[0] - P[0], by = Bp[1] - P[1];
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    const rr = Math.min(r, la * 0.48, lb * 0.48);
    const s0x = P[0] + (ax / la) * rr, s0y = P[1] + (ay / la) * rr;
    if (i === 0) path.moveTo(s0x, s0y); else path.lineTo(s0x, s0y);
    path.quadraticCurveTo(P[0], P[1], P[0] + (bx / lb) * rr, P[1] + (by / lb) * rr);
  }
}
function shapeOf(pts, holes = []) {
  const s = new THREE.Shape();
  tracePath(s, pts);
  for (const h of holes) { const hp = new THREE.Path(); tracePath(hp, h); s.holes.push(hp); }
  return s;
}
function extrude(shape, depth, bev) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 2, curveSegments: 5 });
}
// Side profile [[z, y, filletR]...] extruded across X, centred, `w` wide.
function prof(pts, w, b = 0.0015, holes = []) {
  const bev = Math.min(b, w * 0.3);
  const depth = Math.max(0.0004, w - 2 * bev);
  const g = extrude(shapeOf(pts, holes), depth, bev);
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return crease(g);
}
// Cross-section [[x, y, filletR]...] extruded along Z from z0 (back) to z1 (front).
function xsec(pts, z0, z1, b = 0.0015, holes = []) {
  const bev = Math.min(b, (z0 - z1) * 0.3);
  const depth = Math.max(0.0004, z0 - z1 - 2 * bev);
  const g = extrude(shapeOf(pts, holes), depth, bev);
  g.translate(0, 0, z1 + bev);
  return crease(g);
}
// Top-down outline [[x, z, r]...] extruded along Y (plates lying flat), centred on y.
function plate(pts, h, b = 0.001) {
  const bev = Math.min(b, h * 0.3);
  const depth = Math.max(0.0004, h - 2 * bev);
  const g = extrude(shapeOf(pts.map(([x, z, r]) => [x, -z, r])), depth, bev);
  g.translate(0, 0, -depth / 2);
  g.rotateX(-Math.PI / 2);
  return crease(g);
}
// Lathe along Z: [[radius, z]...] from back (larger z) to front.
function lathe(pts, seg = 16) {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(Math.max(0, r), -z)), seg);
  g.rotateX(-Math.PI / 2);
  return crease(g);
}
// Lathe along Y (handles, bottles): [[radius, y]...] bottom to top.
function latheY(pts, seg = 16) {
  return crease(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg));
}
// rounded box; tiny parts get a single chamfer step, sub-mm radii a plain box
const rb = (w, h, d, r = 0.0012) => {
  const rr = Math.min(r, Math.min(w, h, d) * 0.45);
  if (rr <= 0.00065) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, Math.max(w, h, d) > 0.04 && rr > 0.0018 ? 2 : 1, rr);
};
// cylinder along Z (rBack at +Z), along X, along Y
const cz = (rB, rF, len, s = 14) => new THREE.CylinderGeometry(rB, rF, len, s).rotateX(Math.PI / 2);
const cx = (r, len, s = 12) => new THREE.CylinderGeometry(r, r, len, s).rotateZ(Math.PI / 2);
const cy = (r1, r2, len, s = 12) => new THREE.CylinderGeometry(r1, r2, len, s);
const sph = (r, s = 10) => new THREE.SphereGeometry(r, s, Math.max(6, s * 0.7 | 0));

const _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _q4 = new THREE.Quaternion(), _e3 = new THREE.Euler(), _s3 = new THREE.Vector3();
// Collects geometry per material; `off` shifts everything (so moving parts can
// be authored in model space and parented to a pivot).
class Part {
  constructor(ox = 0, oy = 0, oz = 0) { this.m = {}; this.off = new THREE.Vector3(ox, oy, oz); }
  put(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    _m4.compose(_p3.set(x, y, z).add(this.off), _q4.setFromEuler(_e3.set(rx, ry, rz)), _s3.set(sx, sy, sz));
    g.applyMatrix4(_m4);
    (this.m[mat] || (this.m[mat] = [])).push(g);
    return this;
  }
  // mirrored pair across X (geometry must be symmetric about its own YZ plane)
  pair(mat, geoFn, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.put(mat, geoFn(), x, y, z, rx, ry, rz);
    this.put(mat, geoFn(), -x, y, z, rx, -ry, -rz);
    return this;
  }
  build(parent) {
    const M = mats();
    for (const k in this.m) {
      const geo = mergeGeometries(this.m[k], false);
      if (M[k].map) boxUV(geo, 4);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[k]);
      mesh.castShadow = true;
      mesh.name = 'wm_' + k;
      parent.add(mesh);
    }
    this.m = {};
    return parent;
  }
}
// planar UVs by dominant normal axis (grain runs along the gun: u = z)
function boxUV(g, k) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv.array;
  for (let i = 0; i < p.length / 3; i++) {
    const ax = Math.abs(n[i * 3]), ay = Math.abs(n[i * 3 + 1]);
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (ax >= ay && ax >= Math.abs(n[i * 3 + 2])) { uv[i * 2] = z * k; uv[i * 2 + 1] = y * k; }
    else if (ay >= Math.abs(n[i * 3 + 2])) { uv[i * 2] = z * k; uv[i * 2 + 1] = x * k; }
    else { uv[i * 2] = x * k; uv[i * 2 + 1] = y * k; }
  }
  g.attributes.uv.needsUpdate = true;
}
function marker(g, name, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  g.add(o);
  g.userData[name] = o;
  return o;
}
function pivot(g, name, x, y, z) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  o.name = name;
  g.add(o);
  if (name) g.userData[name] = o;
  return o;
}
// ------------------------------------------------------------ shared bits --
// Picatinny rail along Z on top of y (teeth every 10 mm).
function rail(P, mat, y, z0, z1, w = 0.021, x = 0, rz = 0) {
  const h = 0.0045;
  P.put(mat, xsec([[-w * 0.5, 0], [w * 0.5, 0], [w * 0.5, h * 0.5], [w * 0.38, h * 0.9], [-w * 0.38, h * 0.9], [-w * 0.5, h * 0.5]], z0, z1, 0.0006), x, y, 0, 0, 0, rz);
  const ty = h * 0.9 + 0.0008, tx = -Math.sin(rz) * ty, tyy = Math.cos(rz) * ty;
  for (let z = z0 - 0.004; z > z1 + 0.003; z -= 0.01) P.put(mat, rb(w * 0.86, 0.0026, 0.0052, 0.0006), x + tx, y + tyy, z, 0, 0, rz);
}
function boreDisk(P, r, x, y, z) { P.put('dark', cz(r, r, 0.001, 12), x, y, z); }
// Two-ring sling swivel under a stock
function swivel(P, mat, x, y, z) {
  P.put(mat, new THREE.TorusGeometry(0.008, 0.0016, 6, 14), x, y, z, 0, Math.PI / 2, 0);
}
// cartridge standing along the axis (y up in local)
function roundZ(P, x, y, z, len = 0.02, r = 0.0045, tip = 'copper') {
  P.put('brass', lathe([[0, z + len * 0.5], [r * 1.02, z + len * 0.5], [r, z + len * 0.5 - len * 0.55], [r * 0.82, z - len * 0.1]], 10), x, y, 0);
  P.put(tip, lathe([[r * 0.82, z - len * 0.1], [r * 0.7, z - len * 0.35], [0.0005, z - len * 0.5]], 10), x, y, 0);
}

// ------------------------------------------------------------------ pistols --
function buildPistol(o = {}) {
  const S = o.slide || 'blued', F = o.frame || 'poly', G = o.grip || 'polyGrip';
  const g = new THREE.Group();
  const P = new Part();
  // frame: dust cover, trigger guard web, raked grip with beavertail
  P.put(F, prof([[-0.166, 0.036], [-0.166, 0.02, 0.002], [-0.086, 0.02], [-0.082, 0.013, 0.003], [-0.03, 0.013], [-0.023, 0.004, 0.004],
    [-0.025, -0.01, 0.006], [-0.008, -0.08, 0.005], [0.036, -0.09, 0.005], [0.021, -0.02, 0.012], [0.034, 0.02, 0.006], [0.023, 0.036, 0.002]], 0.027, 0.0018));
  // stippled grip panels (slightly proud of the frame)
  P.put(G, prof([[-0.021, -0.014, 0.003], [-0.01, -0.073, 0.004], [0.028, -0.082, 0.004], [0.016, -0.024, 0.006], [0.018, -0.006, 0.004], [-0.012, -0.006, 0.003]], 0.0286, 0.0008));
  // finger-groove swells on the front strap
  for (let i = 0; i < 3; i++) P.put(F, rb(0.024, 0.004, 0.006, 0.0018), 0, -0.028 - i * 0.017, -0.019 + i * 0.0036, -0.21);
  // trigger guard (thinner than the frame)
  P.put(F, prof([[-0.086, 0.02], [-0.084, -0.006, 0.006], [-0.075, -0.014, 0.008], [-0.03, -0.014, 0.004], [-0.022, -0.004, 0.004], [-0.022, 0.02]], 0.011, 0.0014,
    [[[-0.078, 0.0125], [-0.077, -0.004, 0.004], [-0.071, -0.008, 0.004], [-0.034, -0.008, 0.003], [-0.029, -0.002, 0.003], [-0.029, 0.0125]]]));
  // trigger blade with safety tab
  P.put(F, prof([[-0.049, 0.014], [-0.045, 0.014], [-0.048, 0.003, 0.004], [-0.054, -0.0045, 0.002], [-0.058, -0.0035], [-0.054, 0.004, 0.005]], 0.0062, 0.0012));
  P.put('steel', rb(0.002, 0.008, 0.002, 0.0005), 0, 0.004, -0.052);
  // accessory rail under the dust cover
  for (let i = 0; i < 4; i++) P.put(F, rb(0.024, 0.004, 0.0055, 0.0009), 0, 0.0185, -0.154 + i * 0.011);
  // controls: slide stop, takedown, mag release, pins
  P.put('blued', rb(0.0032, 0.005, 0.024, 0.0012), -0.0142, 0.031, -0.05);
  P.put('blued', rb(0.0032, 0.0034, 0.008, 0.0012), -0.0142, 0.038, -0.037);
  P.pair('blued', () => rb(0.0026, 0.0035, 0.009, 0.001), 0.0141, 0.027, -0.079);
  P.put(F, rb(0.004, 0.0075, 0.0075, 0.0016), -0.0138, 0.004, -0.018);
  P.put('steel', cx(0.0016, 0.0282, 8), 0, 0.026, -0.064);
  P.put('steel', cx(0.0016, 0.0282, 8), 0, 0.028, -0.01);
  P.put('steel', cx(0.0013, 0.0282, 8), 0, 0.02, 0.012);
  P.build(g);

  // slide (moves back on fire; rest z = -0.06)
  const sl = pivot(g, 'slide', 0, 0, -0.06);
  const SP = new Part(0, 0, 0.06);
  SP.put(S, xsec([[-0.0135, 0.036], [0.0135, 0.036], [0.0135, 0.057], [0.0085, 0.0648, 0.002], [-0.0085, 0.0648, 0.002], [-0.0135, 0.057]], 0.019, -0.173, 0.0017));
  // ejection port + barrel hood
  SP.put('dark', rb(0.02, 0.009, 0.036, 0.0015), 0.0045, 0.0615, -0.036);
  SP.put('steel', rb(0.0142, 0.004, 0.03, 0.0012), 0.0012, 0.063, -0.038);
  SP.put('steel', rb(0.0142, 0.009, 0.003, 0.0008), 0.0012, 0.0585, -0.0525);
  // extractor
  SP.put(S, rb(0.0016, 0.004, 0.016, 0.0006), 0.0138, 0.057, -0.044);
  // cocking serrations rear + front
  for (let i = 0; i < 8; i++) SP.pair(S, () => rb(0.0014, 0.017, 0.0012, 0.0004), 0.0137, 0.0472, 0.0148 - i * 0.0024);
  for (let i = 0; i < 5; i++) SP.pair(S, () => rb(0.0014, 0.015, 0.0012, 0.0004), 0.0137, 0.0472, -0.15 - i * 0.0024);
  // sights (three-dot)
  SP.put(S, rb(0.021, 0.003, 0.009, 0.0008), 0, 0.0655, 0.0125);
  SP.pair(S, () => rb(0.0072, 0.0066, 0.009, 0.0014), 0.006, 0.0685, 0.0125);
  SP.put(S, rb(0.0036, 0.0064, 0.0075, 0.001), 0, 0.068, -0.161);
  if (!o.noTrit) {
    SP.pair('trit', () => cz(0.0012, 0.0012, 0.001, 8), 0.006, 0.0692, 0.0173);
    SP.put('trit', cz(0.0011, 0.0011, 0.001, 8), 0, 0.0694, -0.1570);
  } else {
    SP.pair('paint', () => cz(0.001, 0.001, 0.001, 8), 0.006, 0.0692, 0.0173);
    SP.put('paint', cz(0.001, 0.001, 0.001, 8), 0, 0.0694, -0.1570);
  }
  // barrel crown
  SP.put('steel', lathe([[0.0069, -0.170], [0.0069, -0.1742], [0.0055, -0.1748]], 16), 0, 0.049, 0);
  boreDisk(SP, 0.0047, 0, 0.049, -0.1745);
  SP.build(sl);

  // magazine (drops along Y on reload), raked with the grip
  const mg = pivot(g, 'mag', 0, -0.042, 0.006);
  mg.rotation.x = -0.21;
  const MP = new Part();
  MP.put('blued', rb(0.021, 0.098, 0.031, 0.003), 0, 0.0, 0);
  MP.put(F, rb(0.0288, 0.009, 0.044, 0.0032), 0, -0.047, 0.0015);
  roundZ(MP, 0, 0.051, 0.0, 0.022, 0.0045);
  MP.build(mg);

  marker(g, 'muzzle', 0, 0.049, -0.178);
  marker(g, 'eject', 0.02, 0.064, -0.036);
  marker(g, 'gripL', -0.03, -0.04, 0.0);
  marker(g, 'trigger', 0, 0.001, -0.0575);
  g.userData.handR = [0, -0.036, 0.006, -0.21, 0, 0];
  return g;
}

// ---------------------------------------------------------------------- SMG --
function buildSmg(o = {}) {
  const g = new THREE.Group();
  const P = new Part();
  const zBack = o.short ? 0.06 : 0.075, zFront = o.short ? -0.14 : -0.185;
  // stamped receiver with ribs
  P.put('blued', xsec([[-0.0215, 0.006, 0.002], [0.0215, 0.006, 0.002], [0.0215, 0.053], [0.017, 0.059, 0.002], [-0.017, 0.059, 0.002], [-0.0215, 0.053]], zBack, zFront, 0.0018));
  for (const y of [0.019, 0.043]) P.pair('blued', () => rb(0.0024, 0.0055, zBack - zFront - 0.03, 0.0011), 0.0217, y, (zBack + zFront) / 2);
  // top cover with transverse grip ridges
  P.put('parker', xsec([[-0.0185, 0.057], [0.0185, 0.057], [0.0185, 0.063], [0.014, 0.068, 0.002], [-0.014, 0.068, 0.002], [-0.0185, 0.063]], zBack - 0.005, zFront + 0.045, 0.0015));
  for (let i = 0; i < 7; i++) P.put('parker', rb(0.03, 0.0018, 0.0017, 0.0005), 0, 0.0685, zBack - 0.012 - i * 0.004);
  P.put('dark', rb(0.0042, 0.0012, 0.1, 0.0004), 0, 0.0683, -0.05);
  // sights
  P.put('blued', rb(0.02, 0.013, 0.0028, 0.0008), 0, 0.075, zBack - 0.012);
  P.put('dark', cz(0.0017, 0.0017, 0.001, 10), 0, 0.078, zBack - 0.0105);
  P.pair('blued', () => rb(0.0028, 0.017, 0.012, 0.0009), 0.0085, 0.073, zFront + 0.012);
  P.put('blued', rb(0.002, 0.012, 0.003, 0.0006), 0, 0.071, zFront + 0.012);
  // ejection port on the right
  P.put('dark', rb(0.002, 0.017, 0.04, 0.0007), 0.0215, 0.038, -0.05);
  P.put('steel', rb(0.0016, 0.006, 0.036, 0.0006), 0.0213, 0.034, -0.05);
  // barrel nut (knurled) + barrel
  P.put('blued', cz(0.0165, 0.0165, 0.014, 20), 0, 0.034, zFront - 0.007);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    P.put('blued', rb(0.0035, 0.003, 0.013, 0.0006), Math.cos(a) * 0.0168, 0.034 + Math.sin(a) * 0.0168, zFront - 0.007, 0, 0, a + Math.PI / 2);
  }
  // grip: polymer panels around the magwell, grip safety, trigger + guard
  const gz = o.short ? -0.035 : -0.0;
  P.put('polyGrip', prof([[gz - 0.031, 0.007], [gz - 0.025, -0.094, 0.006], [gz + 0.023, -0.099, 0.006], [gz + 0.017, -0.012, 0.01], [gz + 0.022, 0.007]], 0.033, 0.002));
  P.put('blued', prof([[gz + 0.02, 0.004], [gz + 0.026, 0.004, 0.003], [gz + 0.029, -0.045, 0.004], [gz + 0.023, -0.062], [gz + 0.019, -0.04]], 0.018, 0.0012));
  P.put('blued', prof([[gz - 0.076, 0.007], [gz - 0.075, -0.018, 0.006], [gz - 0.066, -0.027, 0.006], [gz - 0.033, -0.027], [gz - 0.029, 0.007]], 0.01, 0.0012,
    [[[gz - 0.069, 0.005], [gz - 0.068, -0.014, 0.004], [gz - 0.062, -0.021, 0.004], [gz - 0.036, -0.021], [gz - 0.035, 0.005]]]));
  P.put('blued', prof([[gz - 0.047, 0.007], [gz - 0.043, 0.007], [gz - 0.046, -0.004, 0.004], [gz - 0.051, -0.011, 0.002], [gz - 0.054, -0.01], [gz - 0.05, -0.002, 0.005]], 0.006, 0.001));
  // selector on the left
  P.put('steel', rb(0.003, 0.012, 0.01, 0.001), -0.0225, 0.014, gz - 0.02);
  if (!o.short) {
    // forward hand guard under the receiver
    P.put('poly', prof([[zFront, 0.012], [zFront + 0.002, -0.003, 0.005], [-0.095, -0.005, 0.006], [-0.088, 0.012]], 0.045, 0.002));
    for (let i = 0; i < 5; i++) P.put('poly', rb(0.046, 0.0016, 0.004, 0.0005), 0, -0.0045, zFront + 0.012 + i * 0.016);
    // folded stock: struts along the sides, hinge block, butt pads at the front
    P.pair('steel', () => cz(0.0028, 0.0028, 0.215, 8), 0.0258, 0.027, -0.03);
    P.put('blued', rb(0.058, 0.03, 0.018, 0.003), 0, 0.03, 0.085);
    P.pair('rubber', () => rb(0.007, 0.032, 0.02, 0.002), 0.0285, 0.026, -0.135);
    P.put('steel', cx(0.0026, 0.058, 8), 0, 0.012, -0.135);
  } else {
    // collapsed wire stock
    P.pair('steel', () => cz(0.0025, 0.0025, 0.2, 8), 0.024, 0.012, -0.02);
    P.put('steel', cx(0.0025, 0.05, 8), 0, 0.012, 0.075);
    P.put('rubber', rb(0.06, 0.012, 0.012, 0.004), 0, 0.012, 0.082);
  }
  // barrel / suppressor
  if (o.suppressor) {
    const zs = zFront - 0.012;
    P.put('parker', lathe([[0.0, zs + 0.001], [0.016, zs], [0.0195, zs - 0.006], [0.0195, zs - 0.012], [0.0205, zs - 0.014], [0.0205, zs - 0.2], [0.0185, zs - 0.212], [0.009, zs - 0.215]], 20), 0, 0.034, 0);
    for (let i = 0; i < 3; i++) P.put('dark', lathe([[0.0207, zs - 0.03 - i * 0.004], [0.0207, zs - 0.032 - i * 0.004]], 20), 0, 0.034, 0);
    P.put('dark', cz(0.0055, 0.0055, 0.001, 12), 0, 0.034, zs - 0.2152);
    marker(g, 'muzzle', 0, 0.034, zs - 0.22);
    // nylon strap loop for the support hand
    P.put('strap', prof([[zFront - 0.034, 0.018], [zFront - 0.03, -0.046, 0.012], [zFront + 0.012, -0.05, 0.012], [zFront + 0.012, 0.01]], 0.018, 0.001,
      [[[zFront - 0.029, 0.012], [zFront - 0.025, -0.041, 0.008], [zFront + 0.007, -0.044, 0.008], [zFront + 0.007, 0.008]]]));
    P.build(g);
  } else {
    P.put('blued', cz(0.0075, 0.0075, 0.05, 14), 0, 0.034, zFront - 0.039);
    P.put('steel', lathe([[0.0085, zFront - 0.058], [0.0085, zFront - 0.066], [0.007, zFront - 0.067]], 14), 0, 0.034, 0);
    boreDisk(P, 0.0042, 0, 0.034, zFront - 0.0668);
    marker(g, 'muzzle', 0, 0.034, zFront - 0.07);
    P.build(g);
  }
  // charging knob on top (bolt)
  const bolt = pivot(g, 'bolt', 0, 0.075, -0.02);
  new Part(0, -0.075, 0.02).put('steel', cy(0.0048, 0.0048, 0.011, 12), 0, 0.075, -0.02).put('steel', lathe([[0.0048, -0.0145], [0.0052, -0.016], [0.0052, -0.024], [0.0048, -0.0255]], 12), 0, 0.075, 0).build(bolt);
  // magazine through the grip
  const mg = pivot(g, 'mag', 0, -0.06, gz + 0.0);
  mg.rotation.x = -0.1;
  const MP = new Part();
  MP.put('blued', rb(0.0215, 0.17, 0.031, 0.003), 0, -0.02, 0);
  MP.pair('blued', () => rb(0.0015, 0.12, 0.006, 0.0007), 0.0108, -0.04, 0.002);
  MP.put('poly', rb(0.026, 0.009, 0.036, 0.003), 0, -0.107, 0.001);
  roundZ(MP, 0, 0.067, 0, 0.02, 0.0045);
  MP.build(mg);
  marker(g, 'eject', 0.025, 0.045, -0.05);
  marker(g, 'gripL', 0, o.suppressor ? -0.01 : 0.01, o.suppressor ? zFront - 0.01 : -0.14);
  marker(g, 'trigger', 0, -0.006, gz - 0.0535);
  g.userData.handR = [0, -0.045, gz - 0.004, -0.1, 0, 0];
  return g;
}

// ----------------------------------------------------------------- shotguns --
function buildPump(o = {}) {
  const Mt = o.metal || 'blued', Fu = o.furniture || 'wood';
  const g = new THREE.Group();
  const P = new Part();
  const by = 0.045, ty = 0.014; // bore / magazine tube axis
  // receiver: flat sides, rounded top, sloped rear into the stock
  P.put(Mt, prof([[-0.17, 0.063, 0.004], [-0.17, 0.001, 0.002], [0.02, 0.001], [0.046, 0.014, 0.01], [0.046, 0.05, 0.004], [0.028, 0.063, 0.014]], 0.046, 0.003));
  P.put('dark', rb(0.002, 0.02, 0.055, 0.0008), 0.0231, 0.036, -0.075);
  P.put(Mt === 'chrome' ? 'steel' : 'parker', rb(0.0015, 0.004, 0.05, 0.0008), 0.023, 0.024, -0.075);
  P.put('dark', rb(0.03, 0.002, 0.07, 0.001), 0, 0.0008, -0.1);
  // pins + safety button
  P.pair('steel', () => cx(0.0022, 0.0015, 10), 0.0232, 0.012, -0.03);
  P.pair('steel', () => cx(0.0022, 0.0015, 10), 0.0232, 0.012, 0.012);
  P.put('dark', cx(0.003, 0.05, 10), 0, 0.009, 0.03);
  // trigger guard + trigger
  P.put(Mt, prof([[-0.04, 0.003], [-0.039, -0.02, 0.006], [-0.03, -0.029, 0.008], [0.012, -0.029, 0.004], [0.02, -0.018, 0.004], [0.022, 0.003]], 0.012, 0.0014,
    [[[-0.033, 0.0], [-0.032, -0.016, 0.004], [-0.026, -0.022, 0.004], [0.008, -0.022, 0.003], [0.014, -0.014, 0.003], [0.015, 0.0]]]));
  P.put('steel', prof([[-0.012, 0.002], [-0.008, 0.002], [-0.011, -0.008, 0.004], [-0.016, -0.016, 0.002], [-0.019, -0.015], [-0.016, -0.006, 0.005]], 0.006, 0.001));
  // barrel with ventilated rib and bead
  P.put(Mt, cz(0.0118, 0.0112, 0.455, 18), 0, by, -0.3975);
  P.put(Mt, rb(0.0075, 0.0026, 0.45, 0.0007), 0, by + 0.0145, -0.4);
  for (let z = -0.19; z > -0.61; z -= 0.035) P.put(Mt, rb(0.004, 0.004, 0.006, 0.0008), 0, by + 0.0115, z);
  P.put('brass', sph(0.0022, 8), 0, by + 0.0176, -0.612);
  P.put('steel', lathe([[0.0112, -0.622], [0.0112, -0.6245], [0.0098, -0.625]], 18), 0, by, 0);
  boreDisk(P, 0.0098, 0, by, -0.6248);
  // magazine tube, barrel clamp, knurled end cap
  P.put(Mt, cz(0.0105, 0.0105, 0.4, 16), 0, ty, -0.37);
  P.put(Mt, prof([[-0.532, by + 0.013, 0.004], [-0.532, ty - 0.012, 0.006], [-0.548, ty - 0.012, 0.006], [-0.548, by + 0.013, 0.004]], 0.026, 0.002));
  P.put(Mt, lathe([[0.0112, -0.568], [0.0122, -0.572], [0.0122, -0.59], [0.0108, -0.596], [0.004, -0.597]], 16), 0, ty, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    P.put(Mt, rb(0.0022, 0.0022, 0.014, 0.0005), Math.cos(a) * 0.0123, ty + Math.sin(a) * 0.0123, -0.581, 0, 0, a);
  }
  // stock: comb, wrist and pistol-grip swell, butt; recoil pad with spacer line
  const stockPts = o.pistolGrip
    ? [[0.046, 0.058, 0.004], [0.12, 0.047, 0.03], [0.358, 0.049, 0.012], [0.372, 0.045], [0.386, -0.082, 0.008], [0.366, -0.088, 0.01], [0.18, -0.02, 0.05],
      [0.105, -0.018, 0.01], [0.108, -0.1, 0.012], [0.07, -0.104, 0.01], [0.05, -0.02, 0.02], [0.046, 0.002]]
    : [[0.046, 0.058, 0.004], [0.12, 0.047, 0.03], [0.358, 0.049, 0.012], [0.372, 0.045], [0.386, -0.082, 0.008], [0.366, -0.088, 0.01], [0.16, -0.034, 0.05],
      [0.098, -0.052, 0.02], [0.074, -0.058, 0.012], [0.058, -0.04, 0.012], [0.046, 0.002]];
  P.put(Fu, prof(stockPts, 0.037, 0.005));
  if (Fu === 'wood') {
    // checkering panels on the wrist
    P.pair('wood', () => rb(0.002, 0.04, 0.05, 0.001), 0.0183, -0.005, 0.1, -0.35);
  } else {
    P.pair('polyGrip', () => rb(0.0016, 0.045, 0.03, 0.0008), 0.0184, -0.055, 0.088, -0.25);
  }
  P.put('paint', rb(0.039, 0.132, 0.0022, 0.0009), 0, -0.019, 0.3808, -0.113);
  P.put('rubber', rb(0.041, 0.137, 0.016, 0.004), 0, -0.019, 0.3905, -0.113);
  swivel(P, 'steel', 0, -0.086, 0.34);
  P.build(g);
  // pump: ribbed fore-end + action bars (the left hand rides on it)
  const pump = pivot(g, 'pump', 0, 0, -0.3);
  const PP = new Part(0, 0, 0.3);
  const ribs = [];
  for (let i = 0; i <= 18; i++) {
    const z = -0.232 - i * (0.14 / 18);
    const r = i === 0 || i === 18 ? 0.018 : i % 2 ? 0.0212 : 0.0198;
    ribs.push([r, z]);
  }
  ribs.unshift([0.0118, -0.228]); ribs.push([0.0125, -0.376]);
  PP.put(Fu, lathe(ribs, 18), 0, ty + 0.003, 0, 0, 0, 0, 1, 1.12, 1);
  PP.pair('steel', () => rb(0.0022, 0.004, 0.14, 0.0008), 0.0122, 0.003, -0.17);
  PP.build(pump);
  marker(pump, 'gripL', 0, 0.042, 0);
  g.userData.gripL = pump.children.find((c) => c.name === 'gripL');
  marker(g, 'muzzle', 0, by, -0.63);
  marker(g, 'eject', 0.028, 0.04, -0.075);
  marker(g, 'port', 0, -0.002, -0.07);
  marker(g, 'trigger', 0, -0.009, -0.019);
  g.userData.handR = o.pistolGrip ? [0, -0.055, 0.086, -0.12, 0, 0] : [0, -0.028, 0.078, -0.55, 0, 0];
  return g;
}
function buildAutoShotgun() {
  const g = new THREE.Group();
  const P = new Part();
  const by = 0.045, ty = 0.014;
  // aluminium receiver with top rail
  P.put('alu', prof([[-0.19, 0.064, 0.004], [-0.19, 0.0, 0.002], [0.035, 0.0], [0.055, 0.012, 0.008], [0.055, 0.056, 0.006], [0.04, 0.064, 0.008]], 0.047, 0.0028));
  rail(P, 'alu', 0.064, 0.045, -0.13, 0.02);
  P.put('dark', rb(0.002, 0.02, 0.06, 0.0008), 0.0236, 0.036, -0.07);
  P.pair('steel', () => cx(0.0022, 0.0014, 10), 0.0236, 0.012, -0.03);
  // ghost-ring rear sight with protective ears
  P.put('alu', rb(0.026, 0.007, 0.022, 0.0015), 0, 0.071, 0.022);
  P.pair('alu', () => rb(0.004, 0.018, 0.02, 0.0015), 0.0115, 0.08, 0.022);
  P.put('steel', new THREE.TorusGeometry(0.0045, 0.0014, 6, 16), 0, 0.083, 0.022);
  // trigger group (polymer) + guard
  P.put('poly', prof([[-0.045, 0.002], [-0.044, -0.022, 0.006], [-0.034, -0.03, 0.008], [0.012, -0.03, 0.004], [0.022, -0.015, 0.004], [0.026, 0.002]], 0.02, 0.002,
    [[[-0.038, -0.001], [-0.037, -0.017, 0.004], [-0.03, -0.023, 0.004], [0.006, -0.023, 0.003], [0.014, -0.012, 0.003], [0.016, -0.001]]]));
  P.put('steel', prof([[-0.014, 0.0], [-0.01, 0.0], [-0.013, -0.009, 0.004], [-0.018, -0.017, 0.002], [-0.021, -0.016], [-0.018, -0.007, 0.005]], 0.006, 0.001));
  // pistol grip
  P.put('polyGrip', prof([[0.02, 0.004], [0.028, -0.03, 0.01], [0.046, -0.1, 0.006], [0.085, -0.104, 0.008], [0.072, -0.03, 0.01], [0.07, 0.004]], 0.03, 0.003));
  // barrel, sight, tube, fore-end
  P.put('parker', cz(0.0118, 0.0112, 0.43, 18), 0, by, -0.405);
  P.put('parker', rb(0.012, 0.006, 0.02, 0.002), 0, by + 0.014, -0.595);
  P.put('paint', rb(0.0028, 0.012, 0.004, 0.0008), 0, by + 0.022, -0.595);
  P.pair('parker', () => rb(0.003, 0.014, 0.014, 0.001), 0.0068, by + 0.02, -0.595);
  P.put('steel', lathe([[0.0112, -0.618], [0.0112, -0.621], [0.0098, -0.622]], 18), 0, by, 0);
  boreDisk(P, 0.0098, 0, by, -0.6218);
  P.put('parker', cz(0.0108, 0.0108, 0.37, 16), 0, ty, -0.375);
  P.put('parker', lathe([[0.0115, -0.56], [0.0128, -0.565], [0.0128, -0.585], [0.011, -0.592], [0.004, -0.593]], 16), 0, ty, 0);
  P.put('parker', prof([[-0.54, by + 0.013, 0.004], [-0.54, ty - 0.013, 0.006], [-0.552, ty - 0.013, 0.006], [-0.552, by + 0.013, 0.004]], 0.027, 0.002));
  P.put('poly', xsec([[-0.024, -0.006, 0.008], [0.024, -0.006, 0.008], [0.024, 0.034, 0.004], [0.017, 0.04], [-0.017, 0.04], [-0.024, 0.034, 0.004]], -0.2, -0.4, 0.004));
  for (let i = 0; i < 9; i++) P.pair('poly', () => rb(0.0016, 0.022, 0.006, 0.0007), 0.0243, 0.014, -0.225 - i * 0.02);
  // telescoping stock with cheek rest; buffer tube
  P.put('alu', cz(0.0145, 0.0145, 0.2, 16), 0, 0.034, 0.155);
  P.put('poly', prof([[0.16, 0.06, 0.006], [0.37, 0.062, 0.006], [0.385, 0.056], [0.392, -0.072, 0.008], [0.37, -0.078, 0.008], [0.3, -0.02, 0.02], [0.18, 0.012, 0.01]], 0.036, 0.004));
  P.put('rubber', rb(0.04, 0.14, 0.014, 0.004), 0, -0.008, 0.398, -0.05);
  P.put('dark', rb(0.03, 0.003, 0.09, 0.001), 0, 0.02, 0.26, 0.2);
  swivel(P, 'steel', 0, -0.02, 0.33);
  P.build(g);
  marker(g, 'muzzle', 0, by, -0.63);
  // bolt + cocking handle (rides the ejection port; pulled on an empty reload)
  const bolt = pivot(g, 'bolt', 0.029, 0.04, -0.07);
  new Part().put('steel', rb(0.008, 0.006, 0.014, 0.002), 0, 0, 0).put('steel', cx(0.0035, 0.018, 12), 0.005, 0, 0).put('steel', rb(0.003, 0.016, 0.05, 0.001), -0.0045, -0.004, 0.006).build(bolt);
  marker(g, 'eject', 0.03, 0.035, -0.07);
  marker(g, 'port', 0, -0.002, -0.075);
  marker(g, 'gripL', 0, 0.025, -0.3);
  marker(g, 'trigger', 0, -0.01, -0.0205);
  g.userData.handR = [0, -0.05, 0.054, -0.25, 0, 0];
  return g;
}

// ------------------------------------------------------------------ rifles --
// Curved box magazine side profile (top at y=0, curving forward as it goes down)
function curvedMag(MP, mat, w, len, depth, curve) {
  const pts = [], back = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = -t * len, dz = -curve * t * t;
    pts.push([dz - depth * 0.5, y]);
    back.push([dz + depth * 0.5, y]);
  }
  const outline = [...pts, ...back.reverse()];
  MP.put(mat, prof(outline, w, 0.0022));
  // stamped side ribs + floor plate
  const rib = [];
  for (let i = 1; i <= N - 1; i++) { const t = i / N; rib.push([-curve * t * t - depth * 0.28, -t * len]); }
  for (let i = N - 1; i >= 1; i--) { const t = i / N; rib.push([-curve * t * t + depth * 0.28, -t * len]); }
  MP.put(mat, prof(rib, w + 0.0022, 0.001));
  const tb = -curve;
  MP.put('poly', rb(w + 0.004, 0.009, depth + 0.006, 0.003), 0, -len - 0.002, tb, Math.atan(2 * curve / len) * 0.9);
}
function buildRifle() {
  const g = new THREE.Group();
  const P = new Part();
  const by = 0.04;
  // upper receiver + carry handle with rear sight
  P.put('alu', prof([[-0.125, 0.063, 0.003], [-0.125, 0.02], [0.082, 0.02], [0.082, 0.05, 0.004], [0.07, 0.063, 0.006]], 0.03, 0.0025));
  P.put('alu', prof([[0.07, 0.061], [0.07, 0.1, 0.006], [-0.1, 0.1, 0.004], [-0.108, 0.086, 0.004], [-0.104, 0.061]], 0.018, 0.0025,
    [[[0.047, 0.066], [0.047, 0.085, 0.004], [-0.08, 0.085, 0.004], [-0.082, 0.066]]]));
  P.put('alu', rb(0.022, 0.018, 0.024, 0.003), 0, 0.106, 0.054);
  P.put('dark', cz(0.0018, 0.0018, 0.001, 10), 0, 0.109, 0.0664);
  P.put('alu', cx(0.006, 0.012, 14), 0.014, 0.1, 0.054);
  P.put('dark', rb(0.003, 0.002, 0.14, 0.001), 0, 0.1008, -0.015);
  // forward assist + ejection port cover + brass deflector
  P.put('alu', cz(0.0075, 0.0075, 0.03, 14), 0.019, 0.048, 0.06, 0, 0.25, 0);
  P.put('steel', lathe([[0.0082, 0.078], [0.0082, 0.071], [0.006, 0.07]], 14), 0.024, 0.048, 0, 0, 0.25, 0);
  P.put('alu', rb(0.0016, 0.018, 0.055, 0.0008), 0.0153, 0.04, -0.02);
  P.put('dark', rb(0.001, 0.0012, 0.055, 0.0004), 0.0161, 0.03, -0.02);
  P.put('alu', rb(0.006, 0.016, 0.014, 0.003), 0.0168, 0.054, 0.02);
  // lower receiver with magwell, takedown pins, selector, bolt catch, mag release
  P.put('alu', prof([[-0.12, 0.021], [-0.12, 0.012, 0.004], [-0.09, 0.012], [-0.088, -0.02, 0.003], [-0.083, -0.03], [-0.03, -0.03], [-0.026, -0.018, 0.004],
    [-0.024, 0.006], [0.05, 0.006], [0.084, 0.014, 0.004], [0.084, 0.021]], 0.029, 0.0022));
  P.put('alu', rb(0.034, 0.012, 0.064, 0.003), 0, -0.024, -0.057);
  P.pair('steel', () => cx(0.0028, 0.0012, 10), 0.015, 0.014, -0.112);
  P.pair('steel', () => cx(0.0028, 0.0012, 10), 0.015, 0.014, 0.074);
  P.put('alu', rb(0.003, 0.004, 0.018, 0.0012), -0.0157, 0.012, 0.026, 0.3);
  P.put('alu', rb(0.003, 0.014, 0.008, 0.0012), -0.0157, 0.004, -0.02);
  P.put('steel', cx(0.004, 0.004, 12), 0.0162, 0.0, -0.022);
  // trigger guard + trigger
  P.put('alu', prof([[-0.026, -0.002], [-0.024, -0.024, 0.004], [0.04, -0.024, 0.004], [0.044, -0.002]], 0.012, 0.0014, [[[-0.019, -0.003], [-0.018, -0.018, 0.003], [0.036, -0.018, 0.003], [0.037, -0.003]]]));
  P.put('steel', prof([[0.008, 0.006], [0.012, 0.006], [0.01, -0.004, 0.004], [0.004, -0.012, 0.002], [0.001, -0.011], [0.005, -0.002, 0.005]], 0.006, 0.001));
  // pistol grip with finger bump
  P.put('polyGrip', prof([[0.042, 0.007], [0.047, -0.02, 0.01], [0.044, -0.03, 0.006], [0.07, -0.098, 0.006], [0.102, -0.1, 0.008], [0.086, -0.03, 0.012], [0.08, 0.007]], 0.028, 0.003));
  // buffer tube + collapsible stock + butt pad + sling loop
  P.put('alu', cz(0.0145, 0.0145, 0.2, 18), 0, 0.042, 0.18);
  P.put('alu', lathe([[0.0165, 0.098], [0.0165, 0.086], [0.0155, 0.085]], 18), 0, 0.042, 0);
  P.put('poly', prof([[0.145, 0.065, 0.006], [0.29, 0.067, 0.004], [0.3, 0.06], [0.305, -0.07, 0.008], [0.285, -0.074, 0.006], [0.24, -0.03, 0.02], [0.16, 0.015, 0.008], [0.145, 0.022, 0.004]], 0.036, 0.004));
  P.put('rubber', rb(0.039, 0.142, 0.012, 0.004), 0, -0.004, 0.308, -0.04);
  P.put('dark', rb(0.012, 0.004, 0.03, 0.001), 0, 0.02, 0.2, 0.25);
  swivel(P, 'steel', 0, -0.02, 0.27);
  // round ribbed handguard with delta ring and cap
  const hg = new THREE.CylinderGeometry(0.023, 0.021, 0.23, 36, 1, true);
  const hp = hg.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), z = hp.getZ(i), a = Math.atan2(z, x);
    const k = Math.cos(a * 18) > 0.3 ? 1 : 0.93;
    hp.setX(i, x * k); hp.setZ(i, z * k);
  }
  hg.rotateX(Math.PI / 2);
  P.put('poly', crease(hg), 0, by, -0.245);
  P.put('dark', cz(0.0205, 0.0195, 0.23, 16), 0, by, -0.245);
  P.put('alu', lathe([[0.012, -0.118], [0.025, -0.119], [0.0265, -0.124], [0.0265, -0.134], [0.024, -0.136], [0.012, -0.137]], 24), 0, by, 0);
  P.put('alu', lathe([[0.022, -0.358], [0.0225, -0.36], [0.0225, -0.37], [0.012, -0.374]], 24), 0, by, 0);
  // barrel, front sight base, bayonet lug, flash hider
  P.put('parker', cz(0.0085, 0.0082, 0.27, 16), 0, by, -0.505);
  P.put('parker', prof([[-0.435, by - 0.012, 0.003], [-0.435, by + 0.016], [-0.442, by + 0.058, 0.002], [-0.455, by + 0.058, 0.002], [-0.462, by + 0.016], [-0.462, by - 0.012, 0.003]], 0.02, 0.002));
  P.put('parker', rb(0.012, 0.012, 0.02, 0.002), 0, by - 0.018, -0.45);
  P.pair('parker', () => rb(0.003, 0.018, 0.012, 0.001), 0.0072, by + 0.066, -0.449);
  P.put('steel', cy(0.0016, 0.0016, 0.018, 8), 0, by + 0.066, -0.449);
  P.put('parker', lathe([[0.0082, -0.61], [0.0095, -0.612], [0.0105, -0.62], [0.0105, -0.655], [0.0095, -0.657], [0.006, -0.658]], 16), 0, by, 0);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.5 + (i - 2) * 0.62;
    P.put('dark', rb(0.0025, 0.0014, 0.024, 0.0005), Math.cos(a) * 0.0104, by + Math.sin(a) * 0.0104, -0.642, 0, 0, a + Math.PI / 2);
  }
  boreDisk(P, 0.0055, 0, by, -0.658);
  P.build(g);
  const mg = pivot(g, 'mag', 0, -0.02, -0.057);
  const MP = new Part();
  curvedMag(MP, 'alu', 0.022, 0.15, 0.058, 0.03);
  MP.build(mg);
  // T-shaped charging handle (pulled back along +Z on an empty reload)
  const ch = pivot(g, 'charge', 0, 0.064, 0.088);
  new Part().put('alu', rb(0.034, 0.006, 0.014, 0.002), 0, 0, 0).put('alu', rb(0.009, 0.005, 0.05, 0.0015), 0, 0, -0.03).put('steel', rb(0.004, 0.004, 0.006, 0.001), 0.012, 0.0035, 0.002).build(ch);
  marker(g, 'muzzle', 0, by, -0.66);
  marker(g, 'eject', 0.028, 0.045, -0.02);
  marker(g, 'gripL', 0, 0.045, -0.29);
  marker(g, 'trigger', 0, -0.005, 0.0015);
  marker(g, 'boltCatch', -0.017, 0.006, -0.026); // left-side paddle, slapped on empty reloads
  g.userData.handR = [0, -0.05, 0.071, -0.37, 0, 0];
  return g;
}
function buildScar() {
  const g = new THREE.Group();
  const P = new Part();
  const by = 0.04;
  // long monolithic upper with full-length top rail and short side rails
  P.put('fde', xsec([[-0.0185, 0.018], [0.0185, 0.018], [0.0205, 0.03, 0.003], [0.0205, 0.062, 0.003], [0.015, 0.068], [-0.015, 0.068], [-0.0205, 0.062, 0.003], [-0.0205, 0.03, 0.003]], 0.085, -0.37, 0.003));
  rail(P, 'alu', 0.068, 0.082, -0.365, 0.021);
  rail(P, 'alu', 0.036, -0.25, -0.36, 0.018, 0.0205, -Math.PI / 2);
  rail(P, 'alu', 0.036, -0.25, -0.36, 0.018, -0.0205, Math.PI / 2);
  for (let i = 0; i < 4; i++) P.pair('dark', () => rb(0.002, 0.008, 0.02, 0.001), 0.0207, 0.047, -0.12 - i * 0.03);
  // non-reciprocating charging handle (left)
  P.put('dark', rb(0.003, 0.0012, 0.2, 0.0005), 0.0206, 0.035, -0.05);
  // lower (polymer) with magwell, pistol grip, guard
  P.put('fde', prof([[-0.125, 0.02], [-0.125, 0.008, 0.004], [-0.092, 0.006], [-0.09, -0.026, 0.004], [-0.03, -0.026, 0.004], [-0.027, 0.004], [0.06, 0.004], [0.086, 0.012, 0.004], [0.086, 0.02]], 0.034, 0.003));
  P.put('fde', prof([[-0.026, -0.002], [-0.024, -0.026, 0.005], [0.04, -0.026, 0.005], [0.046, -0.002]], 0.014, 0.0016, [[[-0.019, -0.003], [-0.018, -0.02, 0.003], [0.036, -0.02, 0.003], [0.038, -0.003]]]));
  P.put('steel', prof([[0.008, 0.004], [0.012, 0.004], [0.01, -0.006, 0.004], [0.004, -0.014, 0.002], [0.001, -0.013], [0.005, -0.004, 0.005]], 0.006, 0.001));
  P.put('polyGrip', prof([[0.042, 0.006], [0.047, -0.02, 0.01], [0.044, -0.03, 0.006], [0.07, -0.098, 0.006], [0.102, -0.1, 0.008], [0.086, -0.03, 0.012], [0.08, 0.006]], 0.029, 0.003));
  P.pair('steel', () => rb(0.003, 0.004, 0.016, 0.0012), 0.0175, 0.012, 0.03, 0.3);
  // side-folding stock with cheek riser and butt pad
  P.put('fde', prof([[0.086, 0.062, 0.004], [0.16, 0.058], [0.2, 0.074, 0.01], [0.3, 0.074, 0.008], [0.31, 0.064], [0.312, -0.064, 0.008], [0.29, -0.07, 0.008], [0.23, -0.034, 0.02], [0.14, -0.004, 0.02], [0.086, 0.012, 0.004]], 0.034, 0.004,
    [[[0.17, 0.028, 0.008], [0.28, 0.034, 0.008], [0.28, -0.012, 0.008], [0.25, -0.022, 0.008]]]));
  P.put('rubber', rb(0.037, 0.132, 0.012, 0.004), 0, 0.0, 0.316, -0.02);
  P.put('dark', cx(0.004, 0.04, 12), 0, 0.03, 0.093);
  // barrel + flash hider
  P.put('parker', cz(0.0092, 0.0088, 0.12, 16), 0, by, -0.43);
  P.put('parker', lathe([[0.0088, -0.49], [0.0105, -0.492], [0.0112, -0.5], [0.0112, -0.54], [0.0098, -0.545], [0.006, -0.546]], 16), 0, by, 0);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; P.put('dark', rb(0.0026, 0.0014, 0.03, 0.0005), Math.cos(a) * 0.0111, by + Math.sin(a) * 0.0111, -0.524, 0, 0, a + Math.PI / 2); }
  boreDisk(P, 0.006, 0, by, -0.5462);
  // folded front sight
  P.put('alu', rb(0.018, 0.006, 0.028, 0.002), 0, 0.077, -0.345);
  // reflex sight: tube on a mount, lens front/back, emissive dot
  P.put('alu', rb(0.024, 0.012, 0.05, 0.003), 0, 0.078, -0.015);
  P.put('alu', lathe([[0.0165, 0.02], [0.0175, 0.018], [0.0175, -0.045], [0.0185, -0.05], [0.0185, -0.056], [0.016, -0.057]], 24).translate(0, 0, 0), 0, 0.1, 0);
  P.put('alu', cy(0.006, 0.006, 0.008, 12), 0, 0.12, -0.012);
  P.put('alu', cx(0.006, 0.008, 12), 0.021, 0.1, -0.012);
  P.put('lens', cz(0.0158, 0.0158, 0.001, 24), 0, 0.1, -0.052);
  P.put('lens', cz(0.0155, 0.0155, 0.001, 24), 0, 0.1, 0.019);
  P.put('reddot', cz(0.0011, 0.0011, 0.0005, 8), 0, 0.1, -0.0515);
  P.build(g);
  const mg = pivot(g, 'mag', 0, -0.02, -0.06);
  const MP = new Part();
  curvedMag(MP, 'blued', 0.023, 0.13, 0.056, 0.012);
  MP.build(mg);
  // non-reciprocating charging handle on the left (slides back in its slot)
  const ch = pivot(g, 'charge', -0.024, 0.056, -0.14);
  new Part().put('steel', rb(0.004, 0.006, 0.012, 0.0015), 0, 0, 0).put('steel', cx(0.0045, 0.016, 12), -0.008, 0, 0).build(ch);
  marker(g, 'muzzle', 0, by, -0.55);
  marker(g, 'eject', 0.028, 0.045, -0.03);
  marker(g, 'gripL', 0, 0.045, -0.3);
  marker(g, 'trigger', 0, -0.007, 0.0015);
  g.userData.handR = [0, -0.05, 0.071, -0.37, 0, 0];
  return g;
}
function buildHunting() {
  const g = new THREE.Group();
  const P = new Part();
  const by = 0.042, sy = 0.098;
  // walnut stock: forend, receiver bed, semi-pistol grip, Monte Carlo comb, butt
  P.put('wood', prof([[-0.34, by - 0.004, 0.006], [-0.34, by - 0.03, 0.01], [-0.1, by - 0.045, 0.02], [-0.02, by - 0.05, 0.01], [0.05, by - 0.04, 0.02], [0.08, -0.03, 0.014],
    [0.1, -0.06, 0.01], [0.13, -0.062, 0.012], [0.14, -0.035, 0.03], [0.4, -0.075, 0.01], [0.41, -0.073], [0.418, 0.052, 0.008], [0.4, 0.058, 0.01], [0.24, 0.058, 0.02],
    [0.16, 0.044, 0.03], [0.08, by + 0.004, 0.01], [-0.12, by + 0.004]], 0.04, 0.006));
  P.pair('wood', () => rb(0.002, 0.04, 0.05, 0.001), 0.0198, -0.022, 0.1, -0.5);
  P.pair('wood', () => rb(0.002, 0.018, 0.1, 0.001), 0.0198, by - 0.028, -0.2);
  P.put('rubber', rb(0.043, 0.14, 0.016, 0.005), 0, -0.01, 0.422, -0.06);
  P.put('dark', rb(0.041, 0.136, 0.003, 0.001), 0, -0.01, 0.412, -0.06);
  swivel(P, 'steel', 0, -0.075, 0.35);
  swivel(P, 'steel', 0, by - 0.034, -0.3);
  // receiver, bolt handle, ejection port
  P.put('blued', xsec([[-0.0145, 0.0], [0.0145, 0.0], [0.0145, 0.004, 0.0], [0.0145, 0.012, 0.012], [0.0, 0.017], [-0.0145, 0.012, 0.012]].map(([x, y, r]) => [x, y + by - 0.004, r]), 0.07, -0.13, 0.002));
  P.put('dark', rb(0.002, 0.012, 0.05, 0.0008), 0.0141, by + 0.004, -0.03);
  // barrel, crown, sight post
  P.put('blued', cz(0.0115, 0.0085, 0.5, 16), 0, by, -0.38);
  P.put('steel', lathe([[0.0086, -0.628], [0.0086, -0.631], [0.0072, -0.632]], 16), 0, by, 0);
  boreDisk(P, 0.0042, 0, by, -0.6315);
  // box magazine + trigger guard + trigger
  P.put('blued', prof([[0.012, by - 0.042], [0.018, -0.03, 0.004], [0.052, -0.03, 0.004], [0.055, by - 0.042]], 0.014, 0.0014, [[[0.018, by - 0.046], [0.022, -0.024, 0.003], [0.047, -0.024, 0.003], [0.049, by - 0.046]]]));
  P.put('steel', prof([[0.03, by - 0.04], [0.034, by - 0.04], [0.032, -0.015, 0.004], [0.026, -0.022, 0.002], [0.024, -0.021], [0.027, -0.012, 0.005]], 0.006, 0.001));
  // scope: rings/bases, eyepiece, tube, turrets, objective bell
  P.put('blued', rb(0.018, 0.012, 0.03, 0.002), 0, by + 0.018, 0.035);
  P.put('blued', rb(0.018, 0.012, 0.03, 0.002), 0, by + 0.018, -0.085);
  for (const z of [0.035, -0.085]) {
    P.put('alu', lathe([[0.0145, z + 0.009], [0.0155, z + 0.008], [0.0155, z - 0.008], [0.0145, z - 0.009]], 20), 0, sy, 0);
    P.put('alu', rb(0.012, 0.03, 0.016, 0.003), 0, (sy + by + 0.02) / 2, z);
    P.pair('steel', () => cx(0.002, 0.004, 8), 0.0155, sy - 0.006, z);
  }
  P.put('alu', lathe([[0.0, 0.132], [0.0175, 0.131], [0.019, 0.128], [0.019, 0.1], [0.0165, 0.094], [0.0165, 0.086], [0.0128, 0.07], [0.0128, -0.14], [0.017, -0.16],
    [0.0255, -0.2], [0.0265, -0.21], [0.0265, -0.232], [0.0255, -0.235], [0.0, -0.236]], 28), 0, sy, 0);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.put('alu', rb(0.002, 0.002, 0.012, 0.0005), Math.cos(a) * 0.0192, sy + Math.sin(a) * 0.0192, 0.114, 0, 0, a); }
  P.put('alu', rb(0.028, 0.028, 0.034, 0.005), 0, sy, -0.025);
  P.put('alu', cy(0.0095, 0.0095, 0.016, 18), 0, sy + 0.02, -0.025);
  P.put('alu', cx(0.0095, 0.016, 18), 0.02, sy, -0.025);
  P.put('paint', cy(0.0097, 0.0097, 0.0015, 18), 0, sy + 0.022, -0.025);
  P.put('lens', cz(0.0235, 0.0235, 0.001, 24), 0, sy, -0.2365);
  P.put('lens', cz(0.0165, 0.0165, 0.001, 24), 0, sy, 0.1325);
  P.build(g);
  // bolt handle (bolt)
  const bolt = pivot(g, 'bolt', 0.017, by + 0.006, 0.02);
  new Part(-0.017, -by - 0.006, -0.02).put('steel', cx(0.0035, 0.03, 10), 0.03, by + 0.004, 0.02, 0, 0, -0.35).put('steel', sph(0.0065, 12), 0.046, by - 0.002, 0.022).build(bolt);
  const mg = pivot(g, 'mag', 0, by - 0.04, -0.04);
  new Part(0, -(by - 0.04), 0.04).put('blued', rb(0.026, 0.05, 0.075, 0.003), 0, by - 0.05, -0.04).put('blued', rb(0.029, 0.006, 0.079, 0.002), 0, by - 0.075, -0.04).build(mg);
  marker(g, 'muzzle', 0, by, -0.64);
  marker(g, 'eject', 0.03, 0.05, -0.02);
  marker(g, 'gripL', 0, 0.06, -0.26);
  marker(g, 'scope', 0, sy, 0.2);
  marker(g, 'trigger', 0, -0.015, 0.0245);
  g.userData.handR = [0, -0.03, 0.105, -0.55, 0, 0];
  return g;
}
function buildM60() {
  const g = new THREE.Group();
  const P = new Part();
  const by = 0.042;
  P.put('parker', prof([[-0.2, 0.074, 0.004], [-0.2, 0.004, 0.004], [0.13, 0.004], [0.15, 0.02, 0.006], [0.15, 0.064], [0.13, 0.074, 0.006]], 0.058, 0.003));
  P.put('parker', prof([[-0.18, 0.074], [-0.17, 0.086, 0.004], [0.1, 0.086, 0.006], [0.12, 0.074]], 0.05, 0.002));
  for (let i = 0; i < 6; i++) P.put('parker', rb(0.048, 0.0016, 0.004, 0.0006), 0, 0.087, 0.06 - i * 0.02);
  P.put('dark', rb(0.002, 0.02, 0.07, 0.001), 0.0292, 0.04, -0.06);
  P.put('polyGrip', prof([[0.02, 0.006], [0.03, -0.03, 0.01], [0.05, -0.1, 0.006], [0.088, -0.104, 0.008], [0.074, -0.03, 0.01], [0.07, 0.006]], 0.032, 0.003));
  P.put('parker', prof([[-0.03, 0.004], [-0.028, -0.026, 0.006], [0.02, -0.026, 0.004], [0.024, 0.004]], 0.014, 0.0015, [[[-0.022, 0.0], [-0.021, -0.02, 0.004], [0.014, -0.02, 0.003], [0.016, 0.0]]]));
  P.put('steel', prof([[-0.004, 0.002], [0.0, 0.002], [-0.002, -0.008, 0.004], [-0.008, -0.015, 0.002], [-0.011, -0.014], [-0.008, -0.006, 0.005]], 0.006, 0.001));
  P.put('od', prof([[0.15, 0.066, 0.006], [0.4, 0.07, 0.01], [0.41, 0.062], [0.415, -0.07, 0.008], [0.39, -0.074, 0.01], [0.24, -0.02, 0.03], [0.15, 0.008, 0.004]], 0.045, 0.005));
  P.put('rubber', rb(0.047, 0.14, 0.014, 0.004), 0, -0.004, 0.42, -0.04);
  P.put('od', xsec([[-0.026, -0.01, 0.01], [0.026, -0.01, 0.01], [0.026, 0.03, 0.006], [0.016, 0.04], [-0.016, 0.04], [-0.026, 0.03, 0.006]], -0.2, -0.43, 0.005));
  for (let i = 0; i < 10; i++) P.pair('dark', () => rb(0.002, 0.004, 0.012, 0.001), 0.0262, 0.012, -0.22 - i * 0.02);
  P.put('parker', cz(0.0165, 0.0155, 0.34, 18), 0, by, -0.6);
  P.put('parker', lathe([[0.0155, -0.77], [0.0175, -0.772], [0.0175, -0.81], [0.012, -0.812]], 18), 0, by, 0);
  boreDisk(P, 0.0065, 0, by, -0.8115);
  P.put('parker', rb(0.01, 0.034, 0.012, 0.002), 0, by + 0.028, -0.77);
  P.put('parker', cy(0.008, 0.008, 0.03, 12), 0, by + 0.005, -0.52);
  P.put('parker', rb(0.02, 0.025, 0.04, 0.004), 0, by - 0.025, -0.52);
  P.put('parker', cz(0.009, 0.009, 0.16, 12), 0, by - 0.03, -0.62);
  P.pair('parker', () => cy(0.004, 0.004, 0.13, 8), 0.018, by - 0.09, -0.69, 0, 0, -0.35);
  // carry handle
  P.put('parker', prof([[-0.44, by + 0.018], [-0.44, by + 0.07, 0.01], [-0.56, by + 0.07, 0.01], [-0.56, by + 0.018]], 0.012, 0.002, [[[-0.45, by + 0.024], [-0.45, by + 0.06, 0.006], [-0.55, by + 0.06, 0.006], [-0.55, by + 0.024]]]));
  P.build(g);
  // ammo box + belt (mag)
  const box = pivot(g, 'mag', -0.06, -0.04, -0.03);
  const BP = new Part(0.06, 0.04, 0.03);
  BP.put('od', rb(0.07, 0.1, 0.11, 0.006), -0.06, -0.04, -0.03);
  BP.put('od', rb(0.074, 0.012, 0.114, 0.004), -0.06, 0.012, -0.03);
  BP.put('steel', rb(0.04, 0.004, 0.012, 0.0015), -0.06, 0.02, -0.03);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    BP.put('brass', cz(0.0048, 0.0048, 0.03, 8), -0.045 + t * 0.04, 0.02 + Math.sin(t * Math.PI) * 0.012, -0.03, 0, 0, 0);
  }
  BP.build(box);
  marker(g, 'muzzle', 0, by, -0.82);
  marker(g, 'eject', 0.035, 0.03, -0.02);
  marker(g, 'gripL', 0, 0.02, -0.3);
  marker(g, 'trigger', 0, -0.009, -0.0115);
  g.userData.handR = [0, -0.05, 0.057, -0.28, 0, 0];
  return g;
}
function buildLauncher() {
  const g = new THREE.Group();
  const P = new Part();
  const by = 0.045;
  P.put('od', prof([[-0.1, 0.07, 0.004], [-0.1, 0.004, 0.004], [0.06, 0.004], [0.08, 0.02, 0.008], [0.08, 0.06], [0.06, 0.07, 0.008]], 0.058, 0.003));
  P.put('polyGrip', prof([[0.02, 0.006], [0.03, -0.03, 0.01], [0.05, -0.1, 0.006], [0.088, -0.104, 0.008], [0.074, -0.03, 0.01], [0.07, 0.006]], 0.032, 0.003));
  P.put('od', prof([[-0.03, 0.004], [-0.028, -0.026, 0.006], [0.02, -0.026, 0.004], [0.024, 0.004]], 0.014, 0.0015, [[[-0.022, 0.0], [-0.021, -0.02, 0.004], [0.014, -0.02, 0.003], [0.016, 0.0]]]));
  P.put('od', prof([[0.08, 0.062, 0.006], [0.3, 0.066, 0.01], [0.31, 0.058], [0.316, -0.07, 0.008], [0.29, -0.074, 0.01], [0.18, -0.02, 0.03], [0.08, 0.01, 0.004]], 0.044, 0.005));
  P.put('rubber', rb(0.046, 0.14, 0.014, 0.004), 0, -0.006, 0.322, -0.04);
  P.put('steel', prof([[-0.004, 0.002], [0.0, 0.002], [-0.002, -0.008, 0.004], [-0.008, -0.015, 0.002], [-0.011, -0.014], [-0.008, -0.006, 0.005]], 0.006, 0.001));
  P.build(g);
  // break-open barrel (hinged under the breech; tips down to load)
  const br = pivot(g, 'breach', 0, 0.006, -0.092);
  const B = new Part(0, -0.006, 0.092);
  B.put('parker', lathe([[0.03, -0.09], [0.034, -0.094], [0.034, -0.4], [0.036, -0.405], [0.036, -0.43], [0.03, -0.434], [0.026, -0.434]], 24), 0, by, 0);
  B.put('dark', lathe([[0.0262, -0.43], [0.0262, -0.0905]], 24), 0, by, 0);
  B.put('dark', cz(0.026, 0.026, 0.001, 20), 0, by, -0.4335);
  for (let i = 0; i < 6; i++) B.put('dark', lathe([[0.0342, -0.15 - i * 0.04], [0.0342, -0.152 - i * 0.04]], 24), 0, by, 0);
  B.put('parker', prof([[-0.2, by + 0.034], [-0.205, by + 0.075, 0.004], [-0.215, by + 0.075, 0.004], [-0.22, by + 0.034]], 0.03, 0.002, [[[-0.207, by + 0.05], [-0.209, by + 0.068, 0.002], [-0.211, by + 0.068, 0.002], [-0.213, by + 0.05]]]));
  B.put('od', rb(0.05, 0.03, 0.12, 0.006), 0, 0.0, -0.26);
  B.put('steel', cx(0.006, 0.062, 12), 0, 0.006, -0.092);
  B.build(br);
  marker(br, 'muzzle', 0, by - 0.006, -0.45 + 0.092);
  g.userData.muzzle = br.userData.muzzle;
  // 40 mm round (carried in by the off hand during a reload)
  const rd = pivot(g, 'round', 0, by, -0.098);
  new Part().put('brass', lathe([[0, 0.002], [0.0275, 0.002], [0.0275, -0.001], [0.0255, -0.003], [0.0255, -0.04]], 20), 0, 0, 0)
    .put('od', lathe([[0.0255, -0.04], [0.0255, -0.06], [0.02, -0.08], [0.008, -0.092], [0, -0.094]], 20), 0, 0, 0)
    .put('copper', lathe([[0.0258, -0.043], [0.0258, -0.049]], 20), 0, 0, 0).build(rd);
  rd.visible = false;
  marker(g, 'gripL', 0, 0.02, -0.28);
  marker(g, 'trigger', 0, -0.009, -0.0115);
  g.userData.handR = [0, -0.05, 0.057, -0.28, 0, 0];
  return g;
}
function buildMinigun() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const S = new Part();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    S.put('parker', cz(0.012, 0.011, 0.9, 10), Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.45);
    S.put('dark', cz(0.006, 0.006, 0.001, 8), Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.9005);
  }
  for (const z of [-0.3, -0.62, -0.84]) S.put('steel', lathe([[0.0, z + 0.02], [0.058, z + 0.02], [0.06, z + 0.017], [0.06, z - 0.017], [0.058, z - 0.02], [0.0, z - 0.02]], 24));
  S.put('parker', cz(0.02, 0.02, 0.9, 12), 0, 0, -0.45);
  S.build(spin);
  g.add(spin);
  const P = new Part();
  P.put('parker', rb(0.16, 0.16, 0.3, 0.012), 0, 0, 0.12);
  P.put('parker', lathe([[0.07, -0.02], [0.075, -0.03], [0.075, -0.07], [0.06, -0.08]], 24));
  for (let i = 0; i < 5; i++) P.pair('parker', () => rb(0.004, 0.12, 0.014, 0.002), 0.081, 0, 0.02 + i * 0.045);
  P.put('steel', cx(0.015, 0.3, 14), 0, 0, 0.3);
  P.pair('polyGrip', () => cy(0.017, 0.017, 0.11, 14), 0.14, -0.045, 0.32);
  P.pair('red', () => rb(0.012, 0.02, 0.014, 0.003), 0.14, 0.025, 0.305);
  P.put('od', rb(0.2, 0.15, 0.2, 0.012), -0.2, -0.05, 0.1);
  P.put('od', rb(0.206, 0.02, 0.206, 0.008), -0.2, 0.03, 0.1);
  for (let i = 0; i < 8; i++) P.put('brass', cx(0.006, 0.06, 8), -0.09 + i * 0.012, 0.0 + i * 0.001, 0.08, 0, 0, 0.3);
  P.build(g);
  g.userData.spin = spin;
  marker(g, 'muzzle', 0, 0, -0.92);
  marker(g, 'eject', 0.1, -0.05, 0.05);
  return g;
}

// ------------------------------------------------------------------- melee --
function buildAxe() {
  const g = new THREE.Group();
  const P = new Part();
  // hickory handle with swelled knob, oval section
  const h = [[0.0, -0.1], [0.018, -0.1], [0.021, -0.09], [0.02, -0.075], [0.015, -0.045], [0.0145, 0.2], [0.0155, 0.45], [0.0165, 0.56], [0.017, 0.61], [0.0, 0.612]];
  P.put('wood', latheY(h, 14), 0, 0, 0, 0, 0, 0, 1, 1, 1.35);
  P.put('dark', latheY([[0.0, 0.0], [0.0152, 0.0], [0.0152, 0.004], [0.0, 0.004]].map(([r, y]) => [r, y]), 14), 0, 0.0, 0, 0, 0, 0, 1, 1, 1.35);
  // red head with ground steel edge and pick
  P.put('red', prof([[-0.035, 0.03, 0.008], [0.035, 0.03, 0.008], [0.045, 0.018], [0.045, -0.018], [0.035, -0.03, 0.008], [-0.035, -0.03, 0.008], [-0.045, -0.012], [-0.045, 0.012]], 0.036, 0.004), 0, 0.58, 0.0);
  P.put('red', prof([[-0.04, 0.026], [-0.13, 0.06, 0.004], [-0.14, 0.05], [-0.13, -0.05, 0.004], [-0.04, -0.026]], 0.018, 0.003), 0, 0.58, 0);
  P.put('blade', prof([[-0.12, 0.057], [-0.143, 0.068, 0.003], [-0.15, 0.05], [-0.15, -0.05], [-0.143, -0.068, 0.003], [-0.12, -0.057]], 0.008, 0.002), 0, 0.58, 0);
  P.put('red', prof([[0.04, 0.02], [0.13, 0.008, 0.004], [0.14, 0.0], [0.13, -0.004], [0.04, -0.02]], 0.022, 0.004), 0, 0.58, 0);
  P.build(g);
  marker(g, 'tip', 0, 0.58, -0.2);
  return g;
}
function buildCrowbar() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('red', cy(0.012, 0.012, 0.72, 6), 0, 0.3, 0);
  // hooked end with claw
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 0.95; pts.push(new THREE.Vector3(0, 0.66 + Math.sin(a) * 0.05, -0.05 + Math.cos(a) * 0.05)); }
  P.put('red', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 6, false), 0, 0, 0);
  P.pair('blade', () => rb(0.008, 0.05, 0.01, 0.002), 0.006, 0.635, -0.1, 0.35, 0, 0);
  P.put('blade', rb(0.02, 0.07, 0.008, 0.003), 0, -0.08, -0.012, -0.35);
  P.put('dark', rb(0.012, 0.006, 0.006, 0.001), 0, 0.3, 0.012);
  P.build(g);
  marker(g, 'tip', 0, 0.7, -0.08);
  return g;
}
function buildMachete() {
  const g = new THREE.Group();
  const P = new Part();
  // polymer handle with finger swells, rivets, guard
  P.put('poly', prof([[0.0, -0.07, 0.01], [0.022, -0.068, 0.008], [0.018, -0.03, 0.01], [0.021, 0.0, 0.01], [0.018, 0.05, 0.006], [-0.016, 0.05, 0.006], [-0.019, 0.02, 0.01], [-0.015, -0.03, 0.012], [-0.02, -0.066, 0.008]], 0.028, 0.006));
  for (const y of [-0.04, 0.0, 0.035]) P.put('brass', cx(0.004, 0.0292, 10), 0, y, 0);
  P.put('blued', rb(0.012, 0.008, 0.05, 0.002), 0, 0.053, 0);
  // blade (flat, curved spine) + ground edge
  const bl = [[-0.02, 0.055], [0.022, 0.055], [0.034, 0.3, 0.02], [0.04, 0.46, 0.02], [0.0, 0.53, 0.01], [-0.022, 0.44], [-0.02, 0.2]];
  P.put('blade', prof(bl, 0.0045, 0.0012));
  P.put('edge', prof([[0.02, 0.06], [0.03, 0.3, 0.02], [0.036, 0.46, 0.02], [0.0, 0.527], [0.034, 0.44], [0.026, 0.3], [0.017, 0.06]], 0.0052, 0.0006));
  P.build(g);
  marker(g, 'tip', 0, 0.5, 0);
  return g;
}

// Katana: handle along +Y (hand centre at the origin), blade in the YZ plane
// with the edge on -Z, curving back (sori) towards the tip; ray-skin handle
// with a diamond cord wrap, iron guard, gilt collar and a wavy temper line.
function buildKatana() {
  const g = new THREE.Group();
  const P = new Part();
  const ZS = 1.3; // oval handle section (deeper edge-to-spine than side-to-side)
  P.put('samegawa', latheY([[0, -0.168], [0.0116, -0.168], [0.0124, -0.12], [0.0129, -0.05], [0.0126, 0.02], [0.0121, 0.074], [0, 0.074]], 18), 0, 0, 0, 0, 0, 0, 1, 1, ZS);
  // cord wrap: crossing ribbons on both flats, wrapped round the edge and spine
  for (let i = 0; i < 8; i++) {
    const y = -0.152 + i * 0.0285;
    for (const sd of [1, -1]) {
      P.put('ito', rb(0.0022, 0.0088, 0.036, 0.0009), sd * 0.0122, y, 0, 0.66, 0, 0);
      P.put('ito', rb(0.0022, 0.0088, 0.036, 0.0009), sd * 0.0126, y + 0.0005, 0, -0.66, 0, 0);
      P.put('ito', rb(0.024, 0.0105, 0.0035, 0.001), 0, y, sd * 0.0162);
    }
  }
  P.pair('gilt', () => rb(0.002, 0.012, 0.022, 0.001), 0.0134, -0.035, 0.002);
  // kashira (pommel cap) + fuchi (collar)
  P.put('ironDark', latheY([[0, -0.186], [0.0105, -0.186], [0.0128, -0.18], [0.0132, -0.168], [0.0126, -0.162], [0, -0.162]], 18), 0, 0, 0, 0, 0, 0, 1, 1, ZS);
  P.put('ironDark', latheY([[0, 0.072], [0.0132, 0.072], [0.0134, 0.084], [0, 0.084]], 18), 0, 0, 0, 0, 0, 0, 1, 1, ZS);
  // seppa washers + tsuba (oval iron guard with openwork) + habaki
  P.put('gilt', cy(0.0205, 0.0205, 0.0022, 20), 0, 0.0852, 0, 0, 0, 0, 1, 1, 1.25);
  const tsuba = [];
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; tsuba.push([Math.cos(a) * 0.036, Math.sin(a) * 0.04, 0.004]); }
  const holes = [[[-0.004, 0.02], [0.004, 0.02], [0.006, 0.03], [-0.006, 0.03]], [[-0.004, -0.02], [0.004, -0.02], [0.006, -0.03], [-0.006, -0.03]]];
  P.put('ironDark', plate(tsuba.map(([x, y, r]) => [x, y, r]), 0.0055, 0.0012), 0, 0.0905, 0);
  for (const h of holes) P.put('dark', plate(h, 0.0058, 0.0004), 0, 0.0905, 0);
  P.put('ironDark', lathe([[0.037, 0.001], [0.0385, 0.0], [0.037, -0.001]], 28).rotateX(Math.PI / 2), 0, 0.0905, 0, 0, 0, 0, 1, 1, 1.08);
  P.put('gilt', cy(0.0205, 0.0205, 0.0022, 20), 0, 0.0955, 0, 0, 0, 0, 1, 1, 1.25);
  P.put('gilt', prof([[-0.0165, 0.097, 0.002], [0.0175, 0.097, 0.002], [0.0165, 0.128, 0.002], [-0.0158, 0.128, 0.002]], 0.0105, 0.0014));
  // blade: curved profile sampled along its length, kissaki at the tip
  const N = 14, L0 = 0.1, L1 = 0.74, SORI = 0.019;
  const zc = (t) => SORI * t * t, wd = (t) => 0.0305 - 0.0062 * t;
  const edgeS = [], spineS = [], hamonS = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = L0 + (L1 - L0) * t;
    edgeS.push([zc(t) - wd(t) / 2, y]);
    spineS.push([zc(t) + wd(t) / 2, y]);
    // temper line: gently wavy (notare) about 35 % of the width back from the edge
    hamonS.push([zc(t) - wd(t) / 2 + wd(t) * (0.33 + 0.07 * Math.sin(t * 23 + 1.3)), y]);
  }
  const zt = zc(1), wt = wd(1);
  const tip = [[zt - wt / 2 + 0.003, L1 + 0.03], [zt - wt / 2 + 0.011, L1 + 0.052], [zt + wt / 2 - 0.004, L1 + 0.066]];
  const bladePts = [...edgeS, ...tip, ...spineS.slice().reverse()];
  P.put('katanaSteel', prof(bladePts, 0.0058, 0.0012));
  // hamon band (hardened edge) slightly proud of the flats, reads as a lighter wavy strip
  P.put('hamon', prof([...edgeS, ...tip.slice(0, 2), [zt - wt / 2 + 0.013, L1 + 0.04], ...hamonS.slice().reverse()], 0.0061, 0.0005));
  // bo-hi: fuller groove along the spine side of each flat
  const hi = [];
  for (let i = 1; i <= N - 3; i++) { const t = i / N; hi.push([zc(t) + wd(t) * 0.12, L0 + (L1 - L0) * t]); }
  for (let i = N - 3; i >= 1; i--) { const t = i / N; hi.push([zc(t) + wd(t) * 0.3, L0 + (L1 - L0) * t]); }
  P.put('ironDark', prof(hi, 0.0061, 0.0003));
  P.build(g);
  marker(g, 'tip', 0, L1 + 0.06, zt);
  return g;
}
// Baseball bat: handle along +Y, knob at the bottom, taped handle, a worn
// brand oval and blood worked into the grain of the barrel.
function buildBat() {
  const g = new THREE.Group();
  const P = new Part();
  const prf = [[0, -0.152], [0.019, -0.152], [0.0242, -0.146], [0.0246, -0.136], [0.0172, -0.126], [0.0131, -0.11], [0.0128, 0.02], [0.0134, 0.12], [0.0152, 0.2],
    [0.0192, 0.29], [0.0248, 0.38], [0.0296, 0.47], [0.0328, 0.56], [0.0336, 0.62], [0.0328, 0.655], [0.0292, 0.672], [0.018, 0.682], [0, 0.684]];
  P.put('ash', latheY(prf, 26));
  // grip tape: overlapping spiral turns
  P.put('ito', latheY([[0.0137, -0.118], [0.0136, 0.12], [0.0132, 0.121], [0.0132, -0.117]], 18));
  for (let i = 0; i < 12; i++) P.put('ito', new THREE.TorusGeometry(0.0137, 0.0011, 5, 18), 0, -0.11 + i * 0.02, 0, Math.PI / 2 + 0.14, 0, 0);
  // brand oval + two blood smears (partial lathe patches just proud of the barrel)
  const patch = (y0, y1, a0, da, mat, lift = 0.0004) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const y = y0 + (y1 - y0) * i / 6;
      let r = 0; for (let k = 1; k < prf.length; k++) if (y <= prf[k][1]) { const [ra, ya] = prf[k - 1], [rb2, yb] = prf[k]; r = ra + (rb2 - ra) * (y - ya) / (yb - ya); break; }
      pts.push(new THREE.Vector2(r + lift, y));
    }
    P.put(mat, crease(new THREE.LatheGeometry(pts, 10, a0, da)));
  };
  patch(0.42, 0.5, 0.2, 0.75, 'dark');
  patch(0.52, 0.65, 2.1, 1.3, 'gore', 0.0006);
  patch(0.57, 0.62, 3.9, 0.9, 'gore', 0.0006);
  patch(0.3, 0.36, 4.6, 0.6, 'gore', 0.0005);
  P.build(g);
  marker(g, 'tip', 0, 0.66, 0);
  return g;
}
// Cast-iron frying pan: handle along +Y, the dish opening towards +X (its
// bottom does the hitting on a forehand swing).
function buildPan() {
  const g = new THREE.Group();
  const P = new Part();
  const R = 0.122, cyD = 0.36;
  const dish = latheY([[0, 0], [0.098, 0], [0.11, 0.0035], [0.118, 0.016], [0.1215, 0.036], [0.1238, 0.0435], [0.1205, 0.0448], [0.1162, 0.037], [0.1125, 0.018], [0.105, 0.0072], [0.094, 0.0052], [0, 0.0052]], 40);
  dish.rotateZ(-Math.PI / 2);
  P.put('castIron', dish, -0.022, cyD, 0);
  // heat ring under the bottom + pour spouts
  P.put('castIron', new THREE.TorusGeometry(0.085, 0.0022, 6, 40), -0.0226, cyD, 0, 0, Math.PI / 2, 0);
  P.pair('castIron', () => rb(0.006, 0.018, 0.012, 0.003), 0.019, cyD, 0.119, 0, 0, 0);
  // handle (tapered flat bar, raised rib, hang hole) + helper lug opposite
  P.put('castIron', prof([[-0.0105, -0.108, 0.009], [0.0105, -0.108, 0.009], [0.0122, 0.08], [0.0142, 0.2], [0.021, 0.244], [-0.021, 0.244], [-0.0142, 0.2], [-0.0122, 0.08]], 0.0125, 0.003,
    [[[-0.0045, -0.098, 0.004], [0.0045, -0.098, 0.004], [0.0045, -0.078, 0.004], [-0.0045, -0.078, 0.004]]]), 0.014, 0, 0);
  P.put('castIron', prof([[-0.004, -0.07], [0.004, -0.07], [0.005, 0.22], [-0.005, 0.22]], 0.004, 0.0012), 0.0215, 0, 0);
  P.put('castIron', prof([[-0.022, cyD + R - 0.004], [0.022, cyD + R - 0.004], [0.016, cyD + R + 0.022, 0.008], [-0.016, cyD + R + 0.022, 0.008]], 0.009, 0.0025,
    [[[-0.009, cyD + R + 0.004, 0.004], [0.009, cyD + R + 0.004, 0.004], [0.006, cyD + R + 0.014, 0.004], [-0.006, cyD + R + 0.014, 0.004]]]), 0.018, 0, 0);
  P.build(g);
  marker(g, 'tip', 0, cyD + R, 0);
  return g;
}
// Chainsaw: bar along -Z like a gun. Right hand on the rear D-handle
// (userData.handR, throttle trigger), left hand across the top of the front
// handle hoop; the chain runs round the bar in two animated runs.
function buildChainsaw() {
  const g = new THREE.Group();
  const P = new Part();
  const bx = 0.066; // bar plane (right of the engine)
  // engine housing + top cover with intake slots
  P.put('sawBody', prof([[0.03, -0.095, 0.02], [0.035, 0.045, 0.03], [-0.01, 0.082, 0.03], [-0.17, 0.086, 0.035], [-0.232, 0.035, 0.03], [-0.236, -0.095, 0.02]], 0.13, 0.012), -0.006, 0, 0);
  P.put('poly', prof([[0.012, 0.07], [-0.018, 0.1, 0.02], [-0.15, 0.104, 0.024], [-0.198, 0.074, 0.02], [-0.19, 0.062], [0.0, 0.062]], 0.112, 0.01), -0.006, 0, 0);
  for (let i = 0; i < 7; i++) P.put('dark', rb(0.07, 0.003, 0.006, 0.001), -0.006, 0.1035, -0.035 - i * 0.017);
  P.put('dark', rb(0.136, 0.022, 0.25, 0.008), -0.006, -0.1, -0.105);
  // starter (left): round cover, grille, pull handle
  P.put('sawBody', cx(0.056, 0.012, 32), -0.077, -0.012, -0.11);
  P.put('dark', cx(0.036, 0.013, 24), -0.078, -0.012, -0.11);
  for (let i = 0; i < 6; i++) P.put('sawBody', rb(0.014, 0.003, 0.07, 0.001), -0.079, -0.012 + (i - 2.5) * 0.011, -0.11);
  P.put('poly', rb(0.016, 0.014, 0.054, 0.005), -0.086, 0.058, -0.176);
  P.put('dark', cy(0.0012, 0.0012, 0.03, 6), -0.082, 0.04, -0.176);
  // fuel & oil caps, spark plug boot, decals
  P.put('poly', cy(0.013, 0.013, 0.012, 16), -0.05, 0.08, 0.005, 0.5, 0, 0);
  P.put('poly', cy(0.011, 0.011, 0.012, 16), 0.03, -0.06, -0.2, 0, 0, 1.2);
  P.put('rubber', cy(0.009, 0.009, 0.03, 12), 0.03, 0.09, -0.08, 0, 0, 0.9);
  P.put('dark', rb(0.002, 0.03, 0.12, 0.0008), 0.0595, 0.0, -0.1);
  P.put('hazard', rb(0.0024, 0.008, 0.12, 0.0008), 0.0598, 0.03, -0.1);
  // muffler (front, perforated) + bucking spikes
  P.put('ironDark', rb(0.06, 0.05, 0.028, 0.006), -0.01, -0.035, -0.247);
  for (let i = 0; i < 4; i++) P.put('dark', rb(0.04, 0.003, 0.004, 0.001), -0.01, -0.052 + i * 0.011, -0.2615);
  for (let i = 0; i < 3; i++) P.put('ironDark', prof([[-0.234, -0.055 + i * 0.03], [-0.252, -0.05 + i * 0.03], [-0.234, -0.04 + i * 0.03]], 0.004, 0.0006), bx - 0.008, 0, 0);
  // clutch / sprocket cover (right) with bar nuts
  P.put('poly', prof([[-0.06, 0.04, 0.01], [-0.06, -0.085, 0.02], [-0.225, -0.085, 0.02], [-0.25, -0.035, 0.02], [-0.232, 0.038, 0.02]], 0.026, 0.006), bx + 0.012, 0, 0);
  for (const z of [-0.17, -0.2]) P.put('steel', cx(0.0075, 0.012, 6), bx + 0.03, -0.02, z);
  // guide bar: rounded nose, rivets, nose sprocket, stripe
  P.put('sawBar', prof([[-0.2, 0.016], [-0.64, 0.011, 0.028], [-0.64, -0.051, 0.028], [-0.2, -0.056]], 0.0052, 0.0012), bx, 0, 0);
  P.put('dark', rb(0.0058, 0.006, 0.33, 0.001), bx, -0.02, -0.4);
  for (let i = 0; i < 5; i++) P.pair('steel', () => cx(0.0026, 0.0062, 8), 0.0, -0.02 + (i % 2 ? 0.012 : -0.012), -0.3 - i * 0.06);
  P.put('steel', cx(0.017, 0.0062, 16), bx, -0.02, -0.615);
  // chain round the nose (static part)
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + i / 8 * Math.PI, zz = -0.614 - Math.cos(a) * 0.0355, yy = -0.02 + Math.sin(a) * 0.0355;
    P.put('chain', rb(0.0072, 0.006, 0.011, 0.0012), bx + (i % 2 ? 0.0022 : -0.0022), yy, zz, -a, 0, 0);
  }
  // front handle hoop (rubber over tube) + chain-brake hand guard
  const hoop = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.076, -0.07, -0.15), new THREE.Vector3(-0.085, 0.04, -0.15), new THREE.Vector3(-0.07, 0.132, -0.142),
    new THREE.Vector3(-0.02, 0.15, -0.138), new THREE.Vector3(0.035, 0.144, -0.14), new THREE.Vector3(0.058, 0.11, -0.146), new THREE.Vector3(0.06, 0.07, -0.15)]);
  P.put('poly', new THREE.TubeGeometry(hoop, 40, 0.0118, 12, false));
  P.put('rubber', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hoop.getPoints(40).slice(12, 32)), 24, 0.0132, 12, false));
  P.put('poly', prof([[-0.18, 0.06], [-0.19, 0.19, 0.01], [-0.205, 0.19, 0.006], [-0.2, 0.06]], 0.14, 0.004), -0.008, 0, 0, 0, 0, 0);
  P.put('dark', rb(0.12, 0.004, 0.003, 0.001), -0.008, 0.17, -0.2);
  // rear D-handle: the grip leans back like a steep pistol grip (see handR)
  const H = [0, 0.02, 0.1, -0.95];
  const hr = (y, z) => new THREE.Vector3(0, H[1] + y * Math.cos(H[3]) - z * Math.sin(H[3]), H[2] + y * Math.sin(H[3]) + z * Math.cos(H[3]));
  const dcurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.07, 0.02), hr(0.062, 0.0), hr(0.02, 0.0), hr(-0.03, 0.0), hr(-0.064, 0.0), new THREE.Vector3(0, -0.058, 0.135), new THREE.Vector3(0, -0.085, 0.03)]);
  P.put('poly', new THREE.TubeGeometry(dcurve, 48, 0.0125, 12, false), 0, 0, 0, 0, 0, 0, 1.15, 1, 1);
  // grip section: oval rubber overmould along the handR axis
  const grip = latheY([[0.0, -0.058], [0.0145, -0.058], [0.0158, -0.04], [0.0162, 0.0], [0.0156, 0.04], [0.0142, 0.058], [0, 0.058]], 18);
  grip.scale(1, 1, 1.15);
  grip.rotateX(H[3]); grip.translate(0, H[1], H[2]);
  P.put('rubber', grip);
  // throttle trigger (under the front of the grip) + lockout lever on top
  const tp = hr(0.02, -0.018);
  P.put('sawBody', prof([[0.0, 0.0], [-0.006, -0.018, 0.004], [0.012, -0.024, 0.004], [0.016, -0.004]], 0.008, 0.0015), 0, tp.y, tp.z, H[3] + 0.9, 0, 0);
  const lp = hr(0.03, 0.017);
  P.put('poly', rb(0.01, 0.006, 0.03, 0.002), 0, lp.y, lp.z, H[3] + Math.PI / 2, 0, 0);
  P.build(g);
  // chain runs (animated: the top run travels forward, the bottom run back)
  const pitch = 0.0175;
  const run = (name, y, dir) => {
    const grp = pivot(g, name, 0, 0, 0);
    const C = new Part();
    for (let z = -0.2 - pitch * 0.5; z > -0.61; z -= pitch) {
      const k = Math.round((z + 0.2) / pitch) & 1;
      C.put('chain', rb(0.0072, 0.0062, 0.0112, 0.0012), bx + (k ? 0.0024 : -0.0024), y, z);
      C.put('chain', rb(0.0058, 0.0055, 0.004, 0.0008), bx + (k ? 0.0026 : -0.0026), y + dir * 0.0045, z - 0.003);
      C.put('steel', rb(0.0026, 0.007, 0.006, 0.0006), bx, y - dir * 0.004, z + pitch * 0.5);
    }
    C.build(grp);
    grp.userData.pitch = pitch;
    return grp;
  };
  run('chainTop', 0.0195, 1);
  run('chainBot', -0.0595, -1);
  marker(g, 'tip', bx, -0.02, -0.65);
  marker(g, 'muzzle', bx, -0.02, -0.4);
  marker(g, 'trigger', 0, tp.y, tp.z);
  marker(g, 'frontGrip', -0.02, 0.15, -0.138);
  g.userData.handR = [0, H[1], H[2], H[3], 0, 0];
  return g;
}

// Defibrillator unit (upright like the kit: thin along Z, handle on top) with
// both paddles docked on its face; upgrade packs (hard cases with an emblem);
// deployed ammo crates (open, four stacks of rounds: userData.stack0..3);
// laser sight box.
function buildDefib() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('defibYellow', rb(0.24, 0.17, 0.09, 0.016));
  P.put('greyPlastic', rb(0.2, 0.125, 0.006, 0.004), 0, -0.004, 0.044);
  P.put('screen', rb(0.066, 0.042, 0.003, 0.001), -0.05, 0.028, 0.047);
  P.put('led', cz(0.005, 0.005, 0.004, 10), 0.012, 0.035, 0.047);
  P.put('white', prof([[0.0, 0.02], [-0.008, 0.0], [0.0, 0.0], [-0.006, -0.02], [0.012, 0.006], [0.004, 0.006], [0.01, 0.02]], 0.004, 0.0006), 0.06, 0.03, 0.047, 0, Math.PI / 2, 0);
  for (const sx of [-1, 1]) {
    P.put('padMetal', rb(0.07, 0.05, 0.006, 0.006), sx * 0.052, -0.036, 0.049);
    P.put('greyPlastic', rb(0.075, 0.055, 0.016, 0.01), sx * 0.052, -0.036, 0.056);
    P.put('defibYellow', cy(0.012, 0.012, 0.05, 12), sx * 0.052, -0.036, 0.074, 0, 0, Math.PI / 2);
    P.put('red', cy(0.005, 0.005, 0.006, 10), sx * 0.08, -0.036, 0.074, 0, 0, Math.PI / 2);
  }
  P.put('poly', new THREE.TorusGeometry(0.036, 0.008, 8, 18, Math.PI), 0, 0.085, 0);
  P.pair('poly', () => rb(0.016, 0.012, 0.03, 0.003), 0.036, 0.088, 0);
  P.build(g);
  return g;
}
function buildUpgradePack(kind) {
  const g = new THREE.Group();
  const P = new Part();
  const body = kind === 'incendiary' ? 'caseRed' : 'caseGreen';
  P.put(body, rb(0.27, 0.19, 0.1, 0.014));
  for (const y of [-0.05, 0.05]) P.put(body, rb(0.274, 0.008, 0.104, 0.003), 0, y, 0);
  P.put('hazard', rb(0.2, 0.026, 0.004, 0.002), 0, -0.068, 0.051);
  for (let i = 0; i < 6; i++) P.put('dark', rb(0.008, 0.03, 0.0045, 0.001), -0.085 + i * 0.034, -0.068, 0.0515, 0, 0, 0.6);
  // emblem: flame (incendiary) or burst (explosive)
  const em = kind === 'incendiary'
    ? [[0, 0.05], [0.012, 0.024], [0.026, 0.012], [0.022, -0.018, 0.01], [0, -0.03, 0.012], [-0.022, -0.018, 0.01], [-0.026, 0.006], [-0.012, 0.004], [-0.008, 0.026]]
    : Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2, r = i % 2 ? 0.016 : 0.034; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const eg = extrude(shapeOf(em), 0.003, 0.0006);
  P.put(kind === 'incendiary' ? 'orange' : 'hazard', eg, 0, 0.02, 0.05);
  P.pair('steel', () => rb(0.02, 0.014, 0.012, 0.003), 0.09, 0.092, 0.042);
  P.put('poly', new THREE.TorusGeometry(0.04, 0.008, 8, 18, Math.PI), 0, 0.095, 0);
  P.pair('poly', () => rb(0.016, 0.012, 0.03, 0.003), 0.04, 0.098, 0);
  P.build(g);
  return g;
}
function buildCrate(kind) {
  const g = new THREE.Group();
  const P = new Part();
  const body = kind === 'incendiary' ? 'caseRed' : 'caseGreen', tipM = kind === 'incendiary' ? 'orange' : 'hazard';
  const W = 0.44, D = 0.3, H = 0.12, t = 0.012;
  P.put(body, rb(W, t, D, 0.004), 0, t / 2, 0);
  P.put(body, rb(W, H, t, 0.004), 0, H / 2, D / 2 - t / 2);
  P.put(body, rb(W, H, t, 0.004), 0, H / 2, -D / 2 + t / 2);
  P.pair(body, () => rb(t, H, D, 0.004), W / 2 - t / 2, H / 2, 0);
  P.put('hazard', rb(W * 0.9, 0.02, 0.003, 0.001), 0, H * 0.55, -D / 2 - 0.001);
  // lid hinged at the back, swung open
  const lid = new THREE.Group(); lid.position.set(0, H, D / 2); lid.rotation.x = -1.95; g.add(lid);
  const LP = new Part();
  LP.put(body, rb(W, 0.014, D, 0.004), 0, 0, -D / 2);
  LP.put(tipM, extrude(shapeOf(Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2, r = i % 2 ? 0.03 : 0.06; return [Math.cos(a) * r, Math.sin(a) * r]; })), 0.003, 0.0006), 0, -0.01, -D / 2, Math.PI / 2, 0, 0);
  LP.build(lid);
  P.build(g);
  // four stacks of rounds (disappear as survivors load up)
  for (let i = 0; i < 4; i++) {
    const st = pivot(g, 'stack' + i, -0.15 + i * 0.1, t, 0);
    const S = new Part();
    S.put('od', rb(0.085, 0.05, 0.24, 0.004), 0, 0.025, 0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      S.put('brass', cy(0.006, 0.006, 0.04, 8), -0.025 + r * 0.025, 0.07, -0.09 + c * 0.036);
      S.put(tipM, cy(0.0005, 0.006, 0.014, 8), -0.025 + r * 0.025, 0.097, -0.09 + c * 0.036);
    }
    S.build(st);
  }
  return g;
}
function buildLaserBox() {
  const g = new THREE.Group();
  const P = new Part();
  const W = 0.34, D = 0.24, H = 0.09, t = 0.01;
  P.put('greyPlastic', rb(W, t, D, 0.003), 0, t / 2, 0);
  P.put('greyPlastic', rb(W, H, t, 0.003), 0, H / 2, D / 2 - t / 2);
  P.put('greyPlastic', rb(W, H, t, 0.003), 0, H / 2, -D / 2 + t / 2);
  P.pair('greyPlastic', () => rb(t, H, D, 0.003), W / 2 - t / 2, H / 2, 0);
  P.put('rubber', rb(W - 0.02, 0.03, D - 0.02, 0.004), 0, 0.025, 0);
  for (let i = 0; i < 3; i++) {
    const x = -0.1 + i * 0.1;
    P.put('poly', rb(0.032, 0.03, 0.1, 0.004), x, 0.055, 0);
    P.put('laserLens', cz(0.007, 0.007, 0.002, 12), x, 0.058, -0.051);
    P.put('steel', rb(0.034, 0.008, 0.02, 0.002), x, 0.074, 0.02);
  }
  P.put('hazard', rb(0.2, 0.02, 0.003, 0.001), 0, H * 0.6, -D / 2 - 0.001);
  P.build(g);
  return g;
}

// ---------------------------------------------------------- throwables etc --
let _flameTex = null;
function flameTexture() {
  if (_flameTex) return _flameTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 96, 2, 32, 84, 64);
  gr.addColorStop(0, 'rgba(255,248,215,1)');
  gr.addColorStop(0.22, 'rgba(255,196,90,0.95)');
  gr.addColorStop(0.55, 'rgba(236,98,24,0.5)');
  gr.addColorStop(1, 'rgba(110,20,0,0)');
  x.fillStyle = gr;
  x.beginPath(); x.moveTo(32, 2);
  x.bezierCurveTo(44, 36, 60, 66, 56, 96); x.bezierCurveTo(52, 124, 12, 124, 8, 96); x.bezierCurveTo(4, 66, 20, 36, 32, 2);
  x.fill();
  _flameTex = new THREE.CanvasTexture(c);
  _flameTex.colorSpace = THREE.SRGBColorSpace;
  return _flameTex;
}
function buildMolotov() {
  const g = new THREE.Group();
  const P = new Part();
  const bottle = [[0.0, -0.07], [0.038, -0.07], [0.041, -0.065], [0.041, 0.04], [0.036, 0.058], [0.016, 0.075], [0.014, 0.1], [0.016, 0.104], [0.016, 0.11], [0.0, 0.11]];
  P.put('glassGreen', latheY(bottle, 20));
  P.put('fuel', latheY([[0.0, -0.066], [0.037, -0.066], [0.037, 0.01], [0.0, 0.01]], 18));
  P.put('label', latheY([[0.0415, -0.03], [0.0415, 0.02]], 20));
  P.put('rag', latheY([[0.017, 0.085], [0.021, 0.09], [0.02, 0.1], [0.018, 0.112], [0.0, 0.114]], 10));
  P.put('rag', cy(0.009, 0.006, 0.05, 6), 0.008, 0.13, 0, 0, 0, -0.35);
  P.put('tape', latheY([[0.0172, 0.093], [0.0172, 0.1]], 10));
  P.build(g);
  // burning rag: crossed additive flame cards (teardrop texture) that flicker
  const fl = new THREE.Group();
  const card = new THREE.PlaneGeometry(0.055, 0.11);
  card.translate(0, 0.04, 0);
  const fm = new THREE.MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(card, fm); m.rotation.y = (i * Math.PI) / 3; fl.add(m); }
  fl.position.set(0.02, 0.135, 0);
  g.add(fl);
  g.userData.flame = fl;
  return g;
}
function buildPipebomb() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('parker', cy(0.03, 0.03, 0.18, 16));
  for (const s of [1, -1]) {
    P.put('parker', latheY([[0.0, 0.0], [0.034, 0.0], [0.035, 0.004], [0.035, 0.02], [0.03, 0.026], [0.0, 0.026]], 6), 0, s > 0 ? 0.085 : -0.085, 0, s > 0 ? 0 : Math.PI, 0, 0);
  }
  P.put('tape', latheY([[0.0312, -0.045], [0.0312, 0.045]], 18));
  P.put('tape', latheY([[0.0316, 0.01], [0.0316, 0.03]], 18), 0, 0, 0, 0, 0, 0.15);
  // timer + wires + LED
  P.put('poly', rb(0.04, 0.05, 0.016, 0.003), 0, 0.0, 0.037);
  P.put('dark', rb(0.028, 0.012, 0.002, 0.001), 0, 0.01, 0.0455);
  P.put('led', sph(0.004, 8), 0.012, -0.013, 0.046);
  const wire = (pts, mat) => P.put(mat, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 12, 0.0018, 5, false));
  wire([[0.01, 0.025, 0.04], [0.02, 0.07, 0.035], [0.012, 0.11, 0.01], [0.0, 0.12, 0.0]], 'red');
  wire([[-0.01, 0.025, 0.04], [-0.022, 0.06, 0.036], [-0.02, 0.1, 0.02]], 'yellow');
  P.put('steel', cy(0.004, 0.004, 0.03, 8), 0, 0.125, 0);
  P.build(g);
  return g;
}
function buildBile() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('glassClear', latheY([[0.0, -0.06], [0.042, -0.06], [0.046, -0.052], [0.046, 0.04], [0.04, 0.05], [0.036, 0.058], [0.0, 0.058]], 20));
  P.put('bile', latheY([[0.0, -0.057], [0.042, -0.057], [0.042, 0.03], [0.0, 0.03]], 18));
  P.put('white', latheY([[0.0, 0.056], [0.038, 0.056], [0.039, 0.06], [0.039, 0.074], [0.035, 0.078], [0.0, 0.078]], 20));
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; P.put('white', rb(0.002, 0.016, 0.003, 0.0006), Math.cos(a) * 0.039, 0.067, Math.sin(a) * 0.039, 0, -a, 0); }
  P.put('label', latheY([[0.0465, -0.035], [0.0465, 0.015]], 20));
  P.build(g);
  return g;
}
function buildMedkit() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('medRed', rb(0.26, 0.18, 0.08, 0.018));
  P.put('dark', rb(0.262, 0.004, 0.082, 0.0015), 0, 0.0, 0);
  P.put('white', rb(0.12, 0.036, 0.004, 0.002), 0, 0.0, 0.041);
  P.put('white', rb(0.036, 0.12, 0.004, 0.002), 0, 0.0, 0.041);
  P.put('steel', rb(0.016, 0.01, 0.006, 0.002), 0.1, 0.0, 0.043);
  P.put('poly', new THREE.TorusGeometry(0.035, 0.007, 8, 16, Math.PI), 0, 0.09, 0);
  P.pair('poly', () => rb(0.016, 0.012, 0.03, 0.003), 0.035, 0.093, 0);
  P.build(g);
  return g;
}
function buildPills() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('pillOrange', latheY([[0.0, -0.045], [0.026, -0.045], [0.028, -0.04], [0.028, 0.042], [0.0, 0.042]], 18));
  P.put('white', latheY([[0.0, 0.04], [0.0305, 0.04], [0.0305, 0.064], [0.028, 0.068], [0.0, 0.068]], 18));
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; P.put('white', rb(0.0018, 0.02, 0.003, 0.0005), Math.cos(a) * 0.0306, 0.053, Math.sin(a) * 0.0306, 0, -a, 0); }
  P.put('label', latheY([[0.0285, -0.028], [0.0285, 0.026]], 18));
  P.build(g);
  return g;
}
function buildAdrenaline() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('white', latheY([[0.0, -0.07], [0.012, -0.07], [0.0135, -0.06], [0.0135, 0.05], [0.012, 0.06], [0.0, 0.06]], 14));
  P.put('orange', latheY([[0.0, 0.058], [0.0125, 0.058], [0.0125, 0.085], [0.0, 0.085]], 14));
  P.put('label', latheY([[0.0138, -0.03], [0.0138, 0.02]], 14));
  P.put('glassClear', rb(0.008, 0.03, 0.002, 0.001), 0, 0.0, 0.0137);
  P.build(g);
  return g;
}
function buildGrenade() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('od', lathe([[0.0, 0.03], [0.02, 0.03], [0.02, -0.012], [0.017, -0.015]], 14));
  P.put('brass', lathe([[0.017, -0.015], [0.019, -0.02], [0.015, -0.036], [0.006, -0.045], [0.0, -0.046]], 14));
  P.put('brass', lathe([[0.0, 0.034], [0.021, 0.034], [0.021, 0.03], [0.0, 0.03]], 14));
  P.build(g);
  return g;
}
function buildGascan() {
  const g = new THREE.Group();
  const P = new Part();
  P.put('red', rb(0.2, 0.25, 0.12, 0.014), 0, 0.125, 0);
  // stamped X ribs on the sides
  for (const s of [1, -1]) {
    P.put('red', rb(0.2, 0.012, 0.006, 0.003), 0, 0.125, s * 0.06, 0, 0, 0.9);
    P.put('red', rb(0.2, 0.012, 0.006, 0.003), 0, 0.125, s * 0.06, 0, 0, -0.9);
  }
  P.put('red', prof([[-0.09, 0.25], [-0.09, 0.3, 0.02], [0.03, 0.3, 0.02], [0.04, 0.25]], 0.03, 0.004, [[[-0.075, 0.255], [-0.07, 0.285, 0.01], [0.015, 0.285, 0.01], [0.02, 0.255]]]), 0, 0, 0, 0, Math.PI / 2, 0);
  P.put('yellow', cy(0.022, 0.024, 0.02, 14), 0.07, 0.26, 0);
  P.put('polymer', cy(0.01, 0.014, 0.07, 10), 0.08, 0.3, 0, 0, 0, -0.5);
  P.build(g);
  return g;
}

const BUILD = {
  pistol: () => buildPistol(),
  magnum() {
    const g = buildPistol({ slide: 'stainless', frame: 'stainless', grip: 'rubber', noTrit: true });
    g.scale.set(1.12, 1.1, 1.28);
    return g;
  },
  smg: () => buildSmg(),
  silencedSmg: () => buildSmg({ short: true, suppressor: true }),
  pumpShotgun: () => buildPump(),
  chromeShotgun: () => buildPump({ metal: 'chrome', furniture: 'poly', pistolGrip: true }),
  autoShotgun: buildAutoShotgun,
  rifle: buildRifle,
  scar: buildScar,
  huntingRifle: buildHunting,
  m60: buildM60,
  grenadeLauncher: buildLauncher,
  minigun: buildMinigun,
  fireaxe: buildAxe,
  crowbar: buildCrowbar,
  machete: buildMachete,
  katana: buildKatana,
  baseballBat: buildBat,
  fryingPan: buildPan,
  chainsaw: buildChainsaw,
  defib: buildDefib,
  upgradeIncendiary: () => buildUpgradePack('incendiary'),
  upgradeExplosive: () => buildUpgradePack('explosive'),
  crateIncendiary: () => buildCrate('incendiary'),
  crateExplosive: () => buildCrate('explosive'),
  laserSight: buildLaserBox,
  molotov: buildMolotov,
  pipebomb: buildPipebomb,
  bile: buildBile,
  medkit: buildMedkit,
  pills: buildPills,
  adrenaline: buildAdrenaline,
  grenade: buildGrenade,
  gascan: buildGascan,
};
BUILD.dualPistols = () => {
  const g = new THREE.Group();
  const a = buildModel('pistol');
  const b = buildModel('pistol');
  b.position.x = -0.3;
  g.add(a); g.add(b);
  g.userData = { ...a.userData, left: b, right: a };
  return g;
};

const cache = new Map();
export function buildModel(type) {
  const fn = BUILD[type];
  if (!fn) return null;
  const g = fn();
  // name referenced parts so clones can re-link them (userData is JSON-cloned by three)
  for (const k in g.userData) { const v = g.userData[k]; if (v && v.isObject3D && !v.name) v.name = k; }
  return g;
}
function cloneLinked(src) {
  const ud = src.userData;
  src.userData = {};
  const c = src.clone(true);
  src.userData = ud;
  const keys = Object.keys(ud);
  c.traverse((o) => { if (o !== c && o.name && keys.includes(o.name)) c.userData[o.name] = o; });
  return c;
}
// Shared, cloned models (cheap) for pickups / third-person.
export function cloneModel(type) {
  if (!cache.has(type)) {
    const m = buildModel(type);
    if (!m) return null;
    cache.set(type, m);
  }
  return cloneLinked(cache.get(type));
}
export function modelMats() { return mats(); }
export function setWeaponEnv(tex, intensity = 0.5) {
  const M = mats();
  for (const k in M) {
    const m = M[k];
    if (m.isMeshStandardMaterial) { m.envMap = tex; m.envMapIntensity = intensity * (m.userData.envK ?? 0.6); m.needsUpdate = true; }
  }
}
